import {Kysely, type Selectable} from 'kysely';
import type {ConfigProposalRejectionReason, ConfigProposals, ConfigUserRole, DB} from '../db';
import type {Override} from '../override-evaluator';
import {createUuidV7} from '../uuid';
import type {ConfigSchema, ConfigValue} from '../zod';

export type ConfigProposalId = string;
export type ConfigProposalVariantId = string;
export type ConfigProposalMemberId = string;

export function createConfigProposalVariantId(): ConfigProposalVariantId {
  return createUuidV7() as ConfigProposalVariantId;
}

export function createConfigProposalId() {
  return createUuidV7() as ConfigProposalId;
}

export function createConfigProposalMemberId(): ConfigProposalMemberId {
  return createUuidV7() as ConfigProposalMemberId;
}

export interface ConfigProposalVariant {
  id: string;
  environmentId: string;
  value: ConfigValue;
  schema: ConfigSchema | null;
  overrides: Override[];
  useBaseSchema: boolean;
}

export interface ConfigProposalMember {
  id: string;
  email: string;
  role: ConfigUserRole;
}

export interface ConfigProposal {
  id: string;
  configId: string;
  authorId: number | null;
  createdAt: Date;
  rejectedAt: Date | null;
  approvedAt: Date | null;
  reviewerId: number | null;
  rejectedInFavorOfProposalId: string | null;
  rejectionReason: ConfigProposalRejectionReason | null;
  baseConfigVersion: number;
  isDelete: boolean;
  description: string;
  value: ConfigValue;
  schema: ConfigSchema | null;
  overrides: Override[];
  message: string | null;
  variants: ConfigProposalVariant[];
  members: ConfigProposalMember[];
}

export interface ConfigProposalVariantWithEnvironment extends ConfigProposalVariant {
  environmentName: string;
}

export interface ConfigProposalInfo {
  id: string;
  configId: string;
  authorId: number | null;
  createdAt: Date;
  rejectedAt: Date | null;
  approvedAt: Date | null;
  reviewerId: number | null;
  rejectedInFavorOfProposalId: string | null;
  baseConfigVersion: number;
  status: 'pending' | 'approved' | 'rejected';
}

export interface PendingProposalWithAuthorEmail {
  id: string;
  authorId: number | null;
  authorEmail: string | null;
  createdAt: Date;
  baseConfigVersion: number;
}

export class ConfigProposalStore {
  constructor(private readonly db: Kysely<DB>) {}

  async getAll(params: {configId: string; projectId: string}): Promise<ConfigProposalInfo[]> {
    const proposals = await this.db
      .selectFrom('config_proposals')
      .innerJoin('configs', 'configs.id', 'config_proposals.config_id')
      .selectAll('config_proposals')
      .where('config_proposals.config_id', '=', params.configId)
      .where('configs.project_id', '=', params.projectId)
      .orderBy('config_proposals.created_at', 'desc')
      .execute();

    return proposals.map(p => ({
      id: p.id,
      configId: p.config_id,
      authorId: p.author_id,
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
        authorEmail: string | null;
        reviewerEmail: string | null;
      }
    >
  > {
    let qb = this.db
      .selectFrom('config_proposals')
      .innerJoin('configs', 'configs.id', 'config_proposals.config_id')
      .leftJoin('users as author', 'author.id', 'config_proposals.author_id')
      .leftJoin('users as reviewer', 'reviewer.id', 'config_proposals.reviewer_id')
      .select(({ref}) => [
        'config_proposals.id',
        'config_proposals.config_id',
        'config_proposals.author_id',
        'config_proposals.created_at',
        'config_proposals.rejected_at',
        'config_proposals.approved_at',
        'config_proposals.reviewer_id',
        'config_proposals.rejected_in_favor_of_proposal_id',
        'config_proposals.base_config_version',
        ref('configs.name').as('config_name'),
        ref('author.email').as('author_email'),
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
      authorId: r.author_id,
      createdAt: r.created_at,
      rejectedAt: r.rejected_at,
      approvedAt: r.approved_at,
      reviewerId: r.reviewer_id,
      rejectedInFavorOfProposalId: r.rejected_in_favor_of_proposal_id,
      baseConfigVersion: r.base_config_version,
      status: r.approved_at ? 'approved' : r.rejected_at ? 'rejected' : ('pending' as const),
      configName: r.config_name!,
      authorEmail: r.author_email ?? null,
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

    if (!result) {
      return undefined;
    }

    // Fetch variants and members
    const [variants, members] = await Promise.all([
      this.getVariantsByProposalId(result.id),
      this.getMembersByProposalId(result.id),
    ]);

    return mapConfigProposal(result, variants, members);
  }

  async getRejectedByApprovalId(params: {
    approvalId: string;
    projectId: string;
  }): Promise<Array<ConfigProposalInfo & {authorEmail: string | null}>> {
    const proposals = await this.db
      .selectFrom('config_proposals')
      .innerJoin('configs', 'configs.id', 'config_proposals.config_id')
      .leftJoin('users as author', 'author.id', 'config_proposals.author_id')
      .select(({ref}) => [
        'config_proposals.id',
        'config_proposals.config_id',
        'config_proposals.author_id',
        'config_proposals.created_at',
        'config_proposals.rejected_at',
        'config_proposals.approved_at',
        'config_proposals.reviewer_id',
        'config_proposals.rejected_in_favor_of_proposal_id',
        'config_proposals.base_config_version',
        ref('author.email').as('author_email'),
      ])
      .where('config_proposals.rejected_in_favor_of_proposal_id', '=', params.approvalId)
      .where('configs.project_id', '=', params.projectId)
      .orderBy('config_proposals.created_at', 'desc')
      .execute();

    return proposals.map(p => ({
      id: p.id,
      configId: p.config_id,
      authorId: p.author_id,
      createdAt: p.created_at,
      rejectedAt: p.rejected_at,
      approvedAt: p.approved_at,
      reviewerId: p.reviewer_id,
      rejectedInFavorOfProposalId: p.rejected_in_favor_of_proposal_id,
      baseConfigVersion: p.base_config_version,
      status: p.approved_at ? 'approved' : p.rejected_at ? 'rejected' : ('pending' as const),
      authorEmail: p.author_email ?? null,
    }));
  }

  async getPendingProposals(params: {
    configId: string;
    projectId: string;
  }): Promise<ConfigProposalInfo[]> {
    const proposals = await this.db
      .selectFrom('config_proposals')
      .innerJoin('configs', 'configs.id', 'config_proposals.config_id')
      .selectAll('config_proposals')
      .where('config_proposals.config_id', '=', params.configId)
      .where('config_proposals.approved_at', 'is', null)
      .where('config_proposals.rejected_at', 'is', null)
      .where('configs.project_id', '=', params.projectId)
      .orderBy('config_proposals.created_at', 'desc')
      .execute();

    return proposals.map(p => ({
      id: p.id,
      configId: p.config_id,
      authorId: p.author_id,
      createdAt: p.created_at,
      rejectedAt: p.rejected_at,
      approvedAt: p.approved_at,
      reviewerId: p.reviewer_id,
      rejectedInFavorOfProposalId: p.rejected_in_favor_of_proposal_id,
      baseConfigVersion: p.base_config_version,
      status: 'pending' as const,
    }));
  }

  async getPendingProposalsWithAuthorEmails(params: {
    configId: string;
    projectId: string;
  }): Promise<PendingProposalWithAuthorEmail[]> {
    const proposals = await this.db
      .selectFrom('config_proposals')
      .innerJoin('configs', 'configs.id', 'config_proposals.config_id')
      .leftJoin('users', 'users.id', 'config_proposals.author_id')
      .select([
        'config_proposals.id',
        'config_proposals.author_id',
        'users.email as author_email',
        'config_proposals.created_at',
        'config_proposals.base_config_version',
      ])
      .where('config_proposals.config_id', '=', params.configId)
      .where('config_proposals.approved_at', 'is', null)
      .where('config_proposals.rejected_at', 'is', null)
      .where('configs.project_id', '=', params.projectId)
      .orderBy('config_proposals.created_at', 'desc')
      .execute();

    return proposals.map(p => ({
      id: p.id,
      authorId: p.author_id,
      authorEmail: p.author_email,
      createdAt: p.created_at,
      baseConfigVersion: p.base_config_version,
    }));
  }

  async create(proposal: ConfigProposal): Promise<ConfigProposal> {
    // Insert the proposal row
    await this.db
      .insertInto('config_proposals')
      .values({
        id: proposal.id,
        config_id: proposal.configId,
        author_id: proposal.authorId,
        created_at: proposal.createdAt,
        rejected_at: proposal.rejectedAt,
        approved_at: proposal.approvedAt,
        reviewer_id: proposal.reviewerId,
        rejected_in_favor_of_proposal_id: proposal.rejectedInFavorOfProposalId,
        rejection_reason: proposal.rejectionReason,
        base_config_version: proposal.baseConfigVersion,
        is_delete: proposal.isDelete,
        description: proposal.description,
        value: proposal.value,
        schema: proposal.schema,
        overrides: JSON.stringify(proposal.overrides),
        message: proposal.message,
      })
      .execute();

    // Insert variant rows
    if (proposal.variants.length > 0) {
      const variantsToInsert = proposal.variants.map(v => ({
        id: v.id,
        proposal_id: proposal.id,
        environment_id: v.environmentId,
        value: v.value,
        schema: v.schema,
        overrides: JSON.stringify(v.overrides),
        use_base_schema: v.useBaseSchema,
      }));

      await this.db.insertInto('config_proposal_variants').values(variantsToInsert).execute();
    }

    // Insert member rows
    if (proposal.members.length > 0) {
      const membersToInsert = proposal.members.map(m => ({
        id: m.id,
        proposal_id: proposal.id,
        email: m.email,
        role: m.role,
      }));

      await this.db.insertInto('config_proposal_members').values(membersToInsert).execute();
    }

    return proposal;
  }

  async updateById(params: {
    id: string;
    projectId: string;
    description?: string;
    isDelete?: boolean;
    value?: ConfigValue;
    schema?: ConfigSchema | null;
    overrides?: Override[];
    approvedAt?: Date;
    rejectedAt?: Date;
    reviewerId?: number;
    rejectedInFavorOfProposalId?: string | null;
    rejectionReason?: ConfigProposalRejectionReason | null;
  }): Promise<void> {
    await this.db
      .updateTable('config_proposals')
      .set({
        description: params.description,
        is_delete: params.isDelete,
        value: params.value,
        schema: params.schema,
        overrides: params.overrides !== undefined ? JSON.stringify(params.overrides) : undefined,
        approved_at: params.approvedAt,
        rejected_at: params.rejectedAt,
        reviewer_id: params.reviewerId,
        rejected_in_favor_of_proposal_id: params.rejectedInFavorOfProposalId,
        rejection_reason: params.rejectionReason,
      })
      .where('id', '=', params.id)
      .where(eb =>
        eb.exists(
          eb
            .selectFrom('configs')
            .select('configs.id')
            .where('configs.id', '=', eb.ref('config_proposals.config_id'))
            .where('configs.project_id', '=', params.projectId),
        ),
      )
      .execute();
  }

  async deleteById(params: {id: string; projectId: string}): Promise<void> {
    await this.db
      .deleteFrom('config_proposals')
      .where('id', '=', params.id)
      .where(eb =>
        eb.exists(
          eb
            .selectFrom('configs')
            .select('configs.id')
            .where('configs.id', '=', eb.ref('config_proposals.config_id'))
            .where('configs.project_id', '=', params.projectId),
        ),
      )
      .execute();
  }

  private async getVariantsByProposalId(
    proposalId: string,
  ): Promise<ConfigProposalVariantWithEnvironment[]> {
    const rows = await this.db
      .selectFrom('config_proposal_variants as cpv')
      .innerJoin('project_environments as pe', 'pe.id', 'cpv.environment_id')
      .select([
        'cpv.id',
        'cpv.proposal_id',
        'cpv.environment_id',
        'cpv.use_base_schema',
        'cpv.value',
        'cpv.schema',
        'cpv.overrides',
        'pe.name as environment_name',
      ])
      .where('cpv.proposal_id', '=', proposalId)
      .execute();

    return rows.map(
      (row): ConfigProposalVariantWithEnvironment => ({
        id: row.id,
        environmentId: row.environment_id,
        useBaseSchema: row.use_base_schema,
        value: row.value as ConfigValue,
        schema: row.schema as ConfigSchema | null,
        overrides: JSON.parse(row.overrides),
        environmentName: row.environment_name,
      }),
    );
  }

  private async getMembersByProposalId(proposalId: string): Promise<ConfigProposalMember[]> {
    const rows = await this.db
      .selectFrom('config_proposal_members')
      .selectAll()
      .where('proposal_id', '=', proposalId)
      .execute();

    return rows.map(row => ({
      id: row.id,
      email: row.email,
      role: row.role,
    }));
  }
}

function mapConfigProposal(
  proposal: Selectable<ConfigProposals>,
  variants: ConfigProposalVariant[],
  members: ConfigProposalMember[],
): ConfigProposal {
  return {
    id: proposal.id,
    configId: proposal.config_id,
    authorId: proposal.author_id,
    createdAt: proposal.created_at,
    rejectedAt: proposal.rejected_at,
    approvedAt: proposal.approved_at,
    reviewerId: proposal.reviewer_id,
    rejectedInFavorOfProposalId: proposal.rejected_in_favor_of_proposal_id,
    rejectionReason: proposal.rejection_reason,
    baseConfigVersion: proposal.base_config_version,
    isDelete: proposal.is_delete,
    description: proposal.description,
    value: proposal.value as ConfigValue,
    schema: proposal.schema as ConfigSchema | null,
    overrides: JSON.parse(proposal.overrides),
    message: proposal.message,
    variants,
    members,
  };
}
