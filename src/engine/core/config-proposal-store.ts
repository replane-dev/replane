import {Kysely, type Selectable} from 'kysely';
import {z} from 'zod';
import type {ConfigProposalRejectionReason, ConfigProposals, DB} from './db';
import {fromJsonb, toJsonb} from './store-utils';
import {createUuidV7} from './uuid';
import {ConfigMember, Uuid} from './zod';

export type ConfigProposalId = string;

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
    proposedDelete: z.boolean(),
    proposedDescription: z.string().nullable(),
    proposedValue: z.object({newValue: z.unknown()}).nullable(),
    proposedSchema: z.object({newSchema: z.unknown()}).nullable(),
    proposedMembers: z.object({newMembers: z.array(ConfigMember())}).nullable(),
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

  async getById(id: string): Promise<ConfigProposal | undefined> {
    const result = await this.db
      .selectFrom('config_proposals')
      .selectAll()
      .where('id', '=', id)
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
        proposed_delete: proposal.proposedDelete,
        proposed_value: proposal.proposedValue ? toJsonb(proposal.proposedValue) : null,
        proposed_description: proposal.proposedDescription,
        proposed_schema: proposal.proposedSchema ? toJsonb(proposal.proposedSchema) : null,
        proposed_members: proposal.proposedMembers ? toJsonb(proposal.proposedMembers) : null,
        message: proposal.message,
      })
      .execute();
  }

  async updateById(params: {
    id: string;
    proposedValue?: unknown;
    proposedDescription?: string;
    proposedSchema?: unknown;
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
        proposed_value:
          params.proposedValue !== undefined ? toJsonb(params.proposedValue) : undefined,
        proposed_description: params.proposedDescription,
        proposed_schema:
          params.proposedSchema !== undefined
            ? params.proposedSchema
              ? toJsonb(params.proposedSchema)
              : null
            : undefined,
        proposed_members:
          params.proposedMembers !== undefined
            ? params.proposedMembers
              ? toJsonb(params.proposedMembers)
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
    proposedDelete: proposal.proposed_delete,
    proposedValue: fromJsonb(proposal.proposed_value),
    proposedDescription: proposal.proposed_description,
    proposedSchema: fromJsonb(proposal.proposed_schema),
    proposedMembers: fromJsonb(proposal.proposed_members),
    message: proposal.message,
  };
}
