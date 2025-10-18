import {Kysely, type Selectable} from 'kysely';
import {z} from 'zod';
import type {ConfigProposals, DB} from './db';
import {fromJsonb, toJsonb} from './store-utils';
import {createUuidV7} from './uuid';
import {Uuid} from './zod';

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
    baseConfigVersion: z.number(),
    proposedDescription: z.string().nullable(),
    proposedValue: z.object({newValue: z.unknown()}).nullable(),
    proposedSchema: z.object({newSchema: z.unknown()}).nullable(),
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
        base_config_version: proposal.baseConfigVersion,
        proposed_value: proposal.proposedValue ? toJsonb(proposal.proposedValue) : null,
        proposed_description: proposal.proposedDescription,
        proposed_schema: proposal.proposedSchema ? toJsonb(proposal.proposedSchema) : null,
      })
      .execute();
  }

  async updateById(params: {
    id: string;
    proposedValue?: unknown;
    proposedDescription?: string;
    proposedSchema?: unknown;
    approvedAt?: Date;
    rejectedAt?: Date;
    reviewerId?: number;
    rejectedInFavorOfProposalId?: string | null;
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
        approved_at: params.approvedAt,
        rejected_at: params.rejectedAt,
        reviewer_id: params.reviewerId,
        rejected_in_favor_of_proposal_id: params.rejectedInFavorOfProposalId,
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
    baseConfigVersion: proposal.base_config_version,
    proposedValue: fromJsonb(proposal.proposed_value),
    proposedDescription: proposal.proposed_description,
    proposedSchema: fromJsonb(proposal.proposed_schema),
  };
}
