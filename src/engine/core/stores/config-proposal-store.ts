import {Kysely, type Selectable} from 'kysely';
import {z} from 'zod';
import type {ConfigProposalRejectionReason, ConfigProposals, DB} from '../db';
import type {Override} from '../override-evaluator';
import {deserializeJson, serializeJson} from '../store-utils';
import {createUuidV7} from '../uuid';
import {ConfigMember, Uuid} from '../zod';

export type ConfigProposalId = string;
export type ConfigProposalVariantId = string;

export function createConfigProposalVariantId(): ConfigProposalVariantId {
  return createUuidV7() as ConfigProposalVariantId;
}

export function createConfigProposalId() {
  return createUuidV7() as ConfigProposalId;
}

export function ConfigProposal() {
  return z.object({
    id: Uuid(),
    configId: Uuid(),
    proposerId: z.number().nullable(),
    createdAt: z.date(),
    rejectedAt: z.date().nullable(),
    approvedAt: z.date().nullable(),
    reviewerId: z.number().nullable(),
    rejectedInFavorOfProposalId: Uuid().nullable(),
    rejectionReason: z
      .enum(['config_edited', 'config_deleted', 'another_proposal_approved', 'rejected_explicitly'])
      .nullable(),
    baseConfigVersion: z.number(),
    originalMembers: z.array(ConfigMember()),
    originalDescription: z.string(),
    proposedDelete: z.boolean(),
    proposedDescription: z.string().nullable(),
    proposedMembers: z.array(ConfigMember()).nullable(),
    message: z.string().nullable(),
  });
}

export interface ConfigProposal extends z.infer<ReturnType<typeof ConfigProposal>> {}

export interface ConfigProposalInfo {
  id: string;
  configId: string;
  proposerId: number | null;
  createdAt: Date;
  rejectedAt: Date | null;
  approvedAt: Date | null;
  reviewerId: number | null;
  rejectedInFavorOfProposalId: string | null;
  baseConfigVersion: number;
  status: 'pending' | 'approved' | 'rejected';
}

export interface PendingProposalWithProposerEmail {
  id: string;
  proposerId: number | null;
  proposerEmail: string | null;
  createdAt: Date;
  baseConfigVersion: number;
}

// Variant change within a proposal
export interface ConfigProposalVariant {
  id: string;
  proposalId: string;
  configVariantId: string;
  environmentId: string | null;
  // undefined = no change proposed, null = explicitly set to null, value = set to value
  proposedValue: unknown | undefined;
  proposedSchema: unknown | undefined;
  proposedOverrides: Override[] | undefined;
  useDefaultSchema: boolean;
}

export interface ConfigProposalVariantWithEnvironment extends ConfigProposalVariant {
  environmentId: string;
  environmentName: string;
}

export class ConfigProposalStore {
  constructor(private readonly db: Kysely<DB>) {}

  async getAll(params: {configId: string}): Promise<ConfigProposalInfo[]> {
    const proposals = await this.db
      .selectFrom('config_proposals')
      .selectAll()
      .where('config_id', '=', params.configId)
      .orderBy('created_at', 'desc')
      .execute();

    return proposals.map(p => ({
      id: p.id,
      configId: p.config_id,
      proposerId: p.proposer_id,
      createdAt: p.created_at,
      rejectedAt: p.rejected_at,
      approvedAt: p.approved_at,
      reviewerId: p.reviewer_id,
      rejectedInFavorOfProposalId: p.rejected_in_favor_of_proposal_id,
      baseConfigVersion: p.base_config_version,
      status: p.approved_at ? 'approved' : p.rejected_at ? 'rejected' : ('pending' as const),
    }));
  }

  async listFiltered(params: {
    projectId: string;
    configIds?: string[];
    proposalIds?: string[];
    statuses?: Array<'pending' | 'approved' | 'rejected'>;
    createdAtGte?: Date;
    createdAtLt?: Date;
    approvedAtGte?: Date;
    approvedAtLt?: Date;
    rejectedAtGte?: Date;
    rejectedAtLt?: Date;
  }): Promise<
    Array<
      ConfigProposalInfo & {
        configName: string;
        proposerEmail: string | null;
        reviewerEmail: string | null;
      }
    >
  > {
    let qb = this.db
      .selectFrom('config_proposals')
      .innerJoin('configs', 'configs.id', 'config_proposals.config_id')
      .leftJoin('users as proposer', 'proposer.id', 'config_proposals.proposer_id')
      .leftJoin('users as reviewer', 'reviewer.id', 'config_proposals.reviewer_id')
      .select(({ref}) => [
        'config_proposals.id',
        'config_proposals.config_id',
        'config_proposals.proposer_id',
        'config_proposals.created_at',
        'config_proposals.rejected_at',
        'config_proposals.approved_at',
        'config_proposals.reviewer_id',
        'config_proposals.rejected_in_favor_of_proposal_id',
        'config_proposals.base_config_version',
        ref('configs.name').as('config_name'),
        ref('proposer.email').as('proposer_email'),
        ref('reviewer.email').as('reviewer_email'),
      ])
      .where('configs.project_id', '=', params.projectId);

    if (params.configIds && params.configIds.length > 0) {
      qb = qb.where('config_proposals.config_id', 'in', params.configIds);
    }
    if (params.proposalIds && params.proposalIds.length > 0) {
      qb = qb.where('config_proposals.id', 'in', params.proposalIds);
    }
    if (params.statuses && params.statuses.length > 0) {
      qb = qb.where(eb =>
        eb.or(
          params.statuses!.map(status => {
            if (status === 'pending') {
              return eb.and([
                eb('config_proposals.approved_at', 'is', null),
                eb('config_proposals.rejected_at', 'is', null),
              ]);
            } else if (status === 'approved') {
              return eb('config_proposals.approved_at', 'is not', null);
            } else {
              return eb('config_proposals.rejected_at', 'is not', null);
            }
          }),
        ),
      );
    }
    if (params.createdAtGte)
      qb = qb.where('config_proposals.created_at', '>=', params.createdAtGte);
    if (params.createdAtLt) qb = qb.where('config_proposals.created_at', '<', params.createdAtLt);
    if (params.approvedAtGte)
      qb = qb.where('config_proposals.approved_at', '>=', params.approvedAtGte);
    if (params.approvedAtLt)
      qb = qb.where('config_proposals.approved_at', '<', params.approvedAtLt);
    if (params.rejectedAtGte)
      qb = qb.where('config_proposals.rejected_at', '>=', params.rejectedAtGte);
    if (params.rejectedAtLt)
      qb = qb.where('config_proposals.rejected_at', '<', params.rejectedAtLt);

    const rows = await qb.orderBy('config_proposals.created_at', 'desc').execute();

    return rows.map(r => ({
      id: r.id,
      configId: r.config_id,
      proposerId: r.proposer_id,
      createdAt: r.created_at,
      rejectedAt: r.rejected_at,
      approvedAt: r.approved_at,
      reviewerId: r.reviewer_id,
      rejectedInFavorOfProposalId: r.rejected_in_favor_of_proposal_id,
      baseConfigVersion: r.base_config_version,
      status: r.approved_at ? 'approved' : r.rejected_at ? 'rejected' : ('pending' as const),
      configName: r.config_name!,
      proposerEmail: r.proposer_email ?? null,
      reviewerEmail: r.reviewer_email ?? null,
    }));
  }

  async getById(params: {id: string; projectId: string}): Promise<ConfigProposal | undefined> {
    const result = await this.db
      .selectFrom('config_proposals')
      .selectAll('config_proposals')
      .innerJoin('configs', 'configs.id', 'config_proposals.config_id')
      .where('config_proposals.id', '=', params.id)
      .where('configs.project_id', '=', params.projectId)
      .executeTakeFirst();

    if (result) {
      return mapConfigProposal(result);
    }

    return undefined;
  }

  async getRejectedByApprovalId(params: {
    approvalId: string;
  }): Promise<Array<ConfigProposalInfo & {proposerEmail: string | null}>> {
    const proposals = await this.db
      .selectFrom('config_proposals')
      .leftJoin('users as proposer', 'proposer.id', 'config_proposals.proposer_id')
      .select(({ref}) => [
        'config_proposals.id',
        'config_proposals.config_id',
        'config_proposals.proposer_id',
        'config_proposals.created_at',
        'config_proposals.rejected_at',
        'config_proposals.approved_at',
        'config_proposals.reviewer_id',
        'config_proposals.rejected_in_favor_of_proposal_id',
        'config_proposals.base_config_version',
        ref('proposer.email').as('proposer_email'),
      ])
      .where('config_proposals.rejected_in_favor_of_proposal_id', '=', params.approvalId)
      .orderBy('config_proposals.created_at', 'desc')
      .execute();

    return proposals.map(p => ({
      id: p.id,
      configId: p.config_id,
      proposerId: p.proposer_id,
      createdAt: p.created_at,
      rejectedAt: p.rejected_at,
      approvedAt: p.approved_at,
      reviewerId: p.reviewer_id,
      rejectedInFavorOfProposalId: p.rejected_in_favor_of_proposal_id,
      baseConfigVersion: p.base_config_version,
      status: p.approved_at ? 'approved' : p.rejected_at ? 'rejected' : ('pending' as const),
      proposerEmail: p.proposer_email ?? null,
    }));
  }

  async getPendingProposals(params: {configId: string}): Promise<ConfigProposalInfo[]> {
    const proposals = await this.db
      .selectFrom('config_proposals')
      .selectAll()
      .where('config_id', '=', params.configId)
      .where('approved_at', 'is', null)
      .where('rejected_at', 'is', null)
      .orderBy('created_at', 'desc')
      .execute();

    return proposals.map(p => ({
      id: p.id,
      configId: p.config_id,
      proposerId: p.proposer_id,
      createdAt: p.created_at,
      rejectedAt: p.rejected_at,
      approvedAt: p.approved_at,
      reviewerId: p.reviewer_id,
      rejectedInFavorOfProposalId: p.rejected_in_favor_of_proposal_id,
      baseConfigVersion: p.base_config_version,
      status: 'pending' as const,
    }));
  }

  async getPendingProposalsWithProposerEmails(params: {
    configId: string;
  }): Promise<PendingProposalWithProposerEmail[]> {
    const proposals = await this.db
      .selectFrom('config_proposals')
      .leftJoin('users', 'users.id', 'config_proposals.proposer_id')
      .select([
        'config_proposals.id',
        'config_proposals.proposer_id',
        'users.email as proposer_email',
        'config_proposals.created_at',
        'config_proposals.base_config_version',
      ])
      .where('config_proposals.config_id', '=', params.configId)
      .where('config_proposals.approved_at', 'is', null)
      .where('config_proposals.rejected_at', 'is', null)
      .orderBy('config_proposals.created_at', 'desc')
      .execute();

    return proposals.map(p => ({
      id: p.id,
      proposerId: p.proposer_id,
      proposerEmail: p.proposer_email,
      createdAt: p.created_at,
      baseConfigVersion: p.base_config_version,
    }));
  }

  async create(proposal: ConfigProposal): Promise<void> {
    await this.db
      .insertInto('config_proposals')
      .values({
        id: proposal.id,
        config_id: proposal.configId,
        proposer_id: proposal.proposerId,
        created_at: proposal.createdAt,
        rejected_at: proposal.rejectedAt,
        approved_at: proposal.approvedAt,
        reviewer_id: proposal.reviewerId,
        rejected_in_favor_of_proposal_id: proposal.rejectedInFavorOfProposalId,
        rejection_reason: proposal.rejectionReason,
        base_config_version: proposal.baseConfigVersion,
        original_members: serializeJson(proposal.originalMembers),
        original_description: proposal.originalDescription,
        proposed_delete: proposal.proposedDelete,
        proposed_description: proposal.proposedDescription,
        proposed_members: proposal.proposedMembers ? serializeJson(proposal.proposedMembers) : null,
        message: proposal.message,
      })
      .execute();
  }

  async updateById(params: {
    id: string;
    proposedDescription?: string;
    proposedMembers?: ConfigMember[];
    proposedDelete?: boolean;
    approvedAt?: Date;
    rejectedAt?: Date;
    reviewerId?: number;
    rejectedInFavorOfProposalId?: string | null;
    rejectionReason?: ConfigProposalRejectionReason | null;
  }): Promise<void> {
    await this.db
      .updateTable('config_proposals')
      .set({
        proposed_description: params.proposedDescription,
        proposed_members:
          params.proposedMembers !== undefined
            ? params.proposedMembers
              ? serializeJson(params.proposedMembers)
              : null
            : undefined,
        proposed_delete: params.proposedDelete,
        approved_at: params.approvedAt,
        rejected_at: params.rejectedAt,
        reviewer_id: params.reviewerId,
        rejected_in_favor_of_proposal_id: params.rejectedInFavorOfProposalId,
        rejection_reason: params.rejectionReason,
      })
      .where('id', '=', params.id)
      .execute();
  }

  async deleteById(id: string): Promise<void> {
    await this.db.deleteFrom('config_proposals').where('id', '=', id).execute();
  }

  // =============== Proposal Variants ===============

  async createVariant(variant: ConfigProposalVariant): Promise<void> {
    await this.db
      .insertInto('config_proposal_variants')
      .values({
        id: variant.id,
        proposal_id: variant.proposalId,
        config_variant_id: variant.configVariantId,
        environment_id: variant.environmentId,
        use_default_schema: variant.useDefaultSchema,
        proposed_value:
          variant.proposedValue !== undefined ? serializeJson(variant.proposedValue) : null,
        proposed_schema:
          variant.proposedSchema !== undefined ? serializeJson(variant.proposedSchema) : null,
        proposed_overrides:
          variant.proposedOverrides !== undefined ? serializeJson(variant.proposedOverrides) : null,
      })
      .execute();
  }

  async createVariants(variants: ConfigProposalVariant[]): Promise<void> {
    if (variants.length === 0) return;

    await this.db
      .insertInto('config_proposal_variants')
      .values(
        variants.map(variant => ({
          id: variant.id,
          proposal_id: variant.proposalId,
          config_variant_id: variant.configVariantId,
          environment_id: variant.environmentId,
          use_default_schema: variant.useDefaultSchema,
          proposed_value:
            variant.proposedValue !== undefined ? serializeJson(variant.proposedValue) : null,
          proposed_schema:
            variant.proposedSchema !== undefined ? serializeJson(variant.proposedSchema) : null,
          proposed_overrides:
            variant.proposedOverrides !== undefined
              ? serializeJson(variant.proposedOverrides)
              : null,
        })),
      )
      .execute();
  }

  async getVariantsByProposalId(
    proposalId: string,
  ): Promise<ConfigProposalVariantWithEnvironment[]> {
    const rows = await this.db
      .selectFrom('config_proposal_variants as cpv')
      .innerJoin('config_variants as cv', 'cv.id', 'cpv.config_variant_id')
      .leftJoin('project_environments as pe', 'pe.id', 'cpv.environment_id')
      .select([
        'cpv.id',
        'cpv.proposal_id',
        'cpv.config_variant_id',
        'cpv.environment_id',
        'cpv.use_default_schema',
        'cpv.proposed_value',
        'cpv.proposed_schema',
        'cpv.proposed_overrides',
        'pe.name as environment_name',
      ])
      .where('cpv.proposal_id', '=', proposalId)
      .execute();

    return rows.map(row => ({
      id: row.id,
      proposalId: row.proposal_id,
      configVariantId: row.config_variant_id,
      environmentId: row.environment_id,
      useDefaultSchema: row.use_default_schema,
      proposedValue: row.proposed_value !== null ? deserializeJson(row.proposed_value) : undefined,
      proposedSchema:
        row.proposed_schema !== null ? deserializeJson(row.proposed_schema) : undefined,
      proposedOverrides:
        row.proposed_overrides !== null
          ? deserializeJson<Override[]>(row.proposed_overrides)!
          : undefined,
      environmentName: row.environment_name ?? '',
    })) as ConfigProposalVariantWithEnvironment[];
  }

  async getVariantByProposalIdAndConfigVariantId(
    proposalId: string,
    configVariantId: string,
  ): Promise<ConfigProposalVariant | null> {
    const row = await this.db
      .selectFrom('config_proposal_variants')
      .selectAll()
      .where('proposal_id', '=', proposalId)
      .where('config_variant_id', '=', configVariantId)
      .executeTakeFirst();

    if (!row) return null;

    return {
      id: row.id,
      proposalId: row.proposal_id,
      configVariantId: row.config_variant_id,
      environmentId: row.environment_id,
      useDefaultSchema: row.use_default_schema,
      proposedValue: row.proposed_value !== null ? deserializeJson(row.proposed_value) : undefined,
      proposedSchema:
        row.proposed_schema !== null ? deserializeJson(row.proposed_schema) : undefined,
      proposedOverrides:
        row.proposed_overrides !== null
          ? deserializeJson<Override[]>(row.proposed_overrides)!
          : undefined,
    };
  }

  async deleteVariantsByProposalId(proposalId: string): Promise<void> {
    await this.db
      .deleteFrom('config_proposal_variants')
      .where('proposal_id', '=', proposalId)
      .execute();
  }
}

function mapConfigProposal(proposal: Selectable<ConfigProposals>): ConfigProposal {
  return {
    id: proposal.id,
    configId: proposal.config_id,
    proposerId: proposal.proposer_id,
    createdAt: proposal.created_at,
    rejectedAt: proposal.rejected_at,
    approvedAt: proposal.approved_at,
    reviewerId: proposal.reviewer_id,
    rejectedInFavorOfProposalId: proposal.rejected_in_favor_of_proposal_id,
    rejectionReason: proposal.rejection_reason,
    baseConfigVersion: proposal.base_config_version,
    originalMembers: deserializeJson(proposal.original_members) ?? [],
    originalDescription: proposal.original_description,
    proposedDelete: proposal.proposed_delete,
    proposedDescription: proposal.proposed_description,
    proposedMembers: deserializeJson(proposal.proposed_members),
    message: proposal.message,
  };
}
