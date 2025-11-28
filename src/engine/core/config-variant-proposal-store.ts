import type {Kysely} from 'kysely';
import type {ConfigProposalRejectionReason, DB} from './db';
import type {Override} from './override-evaluator';
import {deserializeJson, serializeJson} from './store-utils';
import {createUuidV7} from './uuid';

export type ConfigVariantProposalId = string;

export function createConfigVariantProposalId(): ConfigVariantProposalId {
  return createUuidV7() as ConfigVariantProposalId;
}

export interface ConfigVariantProposal {
  id: string;
  configVariantId: string;
  baseVariantVersion: number;
  proposerId: number | null;
  createdAt: Date;
  rejectedAt: Date | null;
  approvedAt: Date | null;
  reviewerId: number | null;
  rejectedInFavorOfProposalId: string | null;
  rejectionReason: ConfigProposalRejectionReason | null;
  // undefined = no change proposed, null = explicitly set to null, value = set to value
  proposedValue: unknown | undefined;
  proposedSchema: unknown | undefined;
  proposedOverrides: Override[] | undefined;
  message: string | null;
  // Note: NO proposedDescription - description is config-level
}

export interface ConfigVariantProposalWithProposer extends ConfigVariantProposal {
  proposerEmail: string | null;
}

export class ConfigVariantProposalStore {
  constructor(private readonly db: Kysely<DB>) {}

  async getById(id: string): Promise<ConfigVariantProposalWithProposer | null> {
    const row = await this.db
      .selectFrom('config_variant_proposals as cvp')
      .leftJoin('users as u', 'u.id', 'cvp.proposer_id')
      .select([
        'cvp.id',
        'cvp.config_variant_id',
        'cvp.base_variant_version',
        'cvp.proposer_id',
        'cvp.created_at',
        'cvp.rejected_at',
        'cvp.approved_at',
        'cvp.reviewer_id',
        'cvp.rejected_in_favor_of_proposal_id',
        'cvp.rejection_reason',
        'cvp.proposed_value',
        'cvp.proposed_schema',
        'cvp.proposed_overrides',
        'cvp.message',
        'u.email as proposer_email',
      ])
      .where('cvp.id', '=', id)
      .executeTakeFirst();

    if (!row) return null;

    return this.mapRowWithProposer(row);
  }

  async getPendingByConfigVariantId(
    configVariantId: string,
  ): Promise<ConfigVariantProposalWithProposer[]> {
    const rows = await this.db
      .selectFrom('config_variant_proposals as cvp')
      .leftJoin('users as u', 'u.id', 'cvp.proposer_id')
      .select([
        'cvp.id',
        'cvp.config_variant_id',
        'cvp.base_variant_version',
        'cvp.proposer_id',
        'cvp.created_at',
        'cvp.rejected_at',
        'cvp.approved_at',
        'cvp.reviewer_id',
        'cvp.rejected_in_favor_of_proposal_id',
        'cvp.rejection_reason',
        'cvp.proposed_value',
        'cvp.proposed_schema',
        'cvp.proposed_overrides',
        'cvp.message',
        'u.email as proposer_email',
      ])
      .where('cvp.config_variant_id', '=', configVariantId)
      .where('cvp.approved_at', 'is', null)
      .where('cvp.rejected_at', 'is', null)
      .orderBy('cvp.created_at', 'asc')
      .execute();

    return rows.map(this.mapRowWithProposer);
  }

  async getAllByConfigVariantId(
    configVariantId: string,
  ): Promise<ConfigVariantProposalWithProposer[]> {
    const rows = await this.db
      .selectFrom('config_variant_proposals as cvp')
      .leftJoin('users as u', 'u.id', 'cvp.proposer_id')
      .select([
        'cvp.id',
        'cvp.config_variant_id',
        'cvp.base_variant_version',
        'cvp.proposer_id',
        'cvp.created_at',
        'cvp.rejected_at',
        'cvp.approved_at',
        'cvp.reviewer_id',
        'cvp.rejected_in_favor_of_proposal_id',
        'cvp.rejection_reason',
        'cvp.proposed_value',
        'cvp.proposed_schema',
        'cvp.proposed_overrides',
        'cvp.message',
        'u.email as proposer_email',
      ])
      .where('cvp.config_variant_id', '=', configVariantId)
      .orderBy('cvp.created_at', 'desc')
      .execute();

    return rows.map(this.mapRowWithProposer);
  }

  async create(proposal: ConfigVariantProposal): Promise<void> {
    await this.db
      .insertInto('config_variant_proposals')
      .values({
        id: proposal.id,
        config_variant_id: proposal.configVariantId,
        base_variant_version: proposal.baseVariantVersion,
        proposer_id: proposal.proposerId,
        created_at: proposal.createdAt,
        rejected_at: proposal.rejectedAt,
        approved_at: proposal.approvedAt,
        reviewer_id: proposal.reviewerId,
        rejected_in_favor_of_proposal_id: proposal.rejectedInFavorOfProposalId,
        rejection_reason: proposal.rejectionReason,
        // undefined = no change (store as NULL), value = change (store as JSON string)
        proposed_value:
          proposal.proposedValue !== undefined ? serializeJson(proposal.proposedValue) : null,
        proposed_schema:
          proposal.proposedSchema !== undefined ? serializeJson(proposal.proposedSchema) : null,
        proposed_overrides:
          proposal.proposedOverrides !== undefined
            ? serializeJson(proposal.proposedOverrides)
            : null,
        message: proposal.message,
      })
      .execute();
  }

  async approve(params: {id: string; approvedAt: Date; reviewerId: number}): Promise<void> {
    await this.db
      .updateTable('config_variant_proposals')
      .set({
        approved_at: params.approvedAt,
        reviewer_id: params.reviewerId,
      })
      .where('id', '=', params.id)
      .execute();
  }

  async reject(params: {
    id: string;
    rejectedAt: Date;
    reviewerId: number;
    reason: ConfigProposalRejectionReason;
    rejectedInFavorOfProposalId?: string;
  }): Promise<void> {
    await this.db
      .updateTable('config_variant_proposals')
      .set({
        rejected_at: params.rejectedAt,
        reviewer_id: params.reviewerId,
        rejection_reason: params.reason,
        rejected_in_favor_of_proposal_id: params.rejectedInFavorOfProposalId ?? null,
      })
      .where('id', '=', params.id)
      .execute();
  }

  private mapRowWithProposer(row: {
    id: string;
    config_variant_id: string;
    base_variant_version: number;
    proposer_id: number | null;
    created_at: Date;
    rejected_at: Date | null;
    approved_at: Date | null;
    reviewer_id: number | null;
    rejected_in_favor_of_proposal_id: string | null;
    rejection_reason: ConfigProposalRejectionReason | null;
    proposed_value: string | null;
    proposed_schema: string | null;
    proposed_overrides: string | null;
    message: string | null;
    proposer_email: string | null;
  }): ConfigVariantProposalWithProposer {
    return {
      id: row.id,
      configVariantId: row.config_variant_id,
      baseVariantVersion: row.base_variant_version,
      proposerId: row.proposer_id,
      createdAt: row.created_at,
      rejectedAt: row.rejected_at,
      approvedAt: row.approved_at,
      reviewerId: row.reviewer_id,
      rejectedInFavorOfProposalId: row.rejected_in_favor_of_proposal_id,
      rejectionReason: row.rejection_reason,
      // Note: return undefined if column is NULL (no change proposed), deserialize otherwise
      // This distinguishes "no change" (undefined) from "set to null" (null from deserializing "null")
      proposedValue: row.proposed_value !== null ? deserializeJson(row.proposed_value) : undefined,
      proposedSchema:
        row.proposed_schema !== null ? deserializeJson(row.proposed_schema) : undefined,
      proposedOverrides:
        row.proposed_overrides !== null
          ? deserializeJson<Override[]>(row.proposed_overrides)!
          : undefined,
      message: row.message,
      proposerEmail: row.proposer_email,
    };
  }
}
