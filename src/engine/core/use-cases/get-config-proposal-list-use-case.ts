import type {TransactionalUseCase} from '../use-case';
import type {NormalizedEmail} from '../zod';

export interface GetConfigProposalListRequest {
  currentUserEmail: NormalizedEmail;
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
}

export interface GetConfigProposalListResponse {
  proposals: Array<{
    id: string;
    configId: string;
    configName: string;
    proposerId: number | null;
    proposerEmail: string | null;
    reviewerId: number | null;
    reviewerEmail: string | null;
    createdAt: Date;
    approvedAt: Date | null;
    rejectedAt: Date | null;
    rejectedInFavorOfProposalId: string | null;
    baseConfigVersion: number;
    status: 'pending' | 'approved' | 'rejected';
  }>;
}

export function createGetConfigProposalListUseCase(): TransactionalUseCase<
  GetConfigProposalListRequest,
  GetConfigProposalListResponse
> {
  return async (_ctx, tx, req) => {
    // Permission: rely on existing project membership checks by filtering to projectId
    const rows = await tx.configProposals.listFiltered({
      projectId: req.projectId,
      configIds: req.configIds,
      proposalIds: req.proposalIds,
      statuses: req.statuses,
      createdAtGte: req.createdAtGte,
      createdAtLt: req.createdAtLt,
      approvedAtGte: req.approvedAtGte,
      approvedAtLt: req.approvedAtLt,
      rejectedAtGte: req.rejectedAtGte,
      rejectedAtLt: req.rejectedAtLt,
    });

    return {
      proposals: rows.map(r => ({
        id: r.id,
        configId: r.configId,
        configName: r.configName,
        proposerId: r.proposerId,
        proposerEmail: r.proposerEmail,
        reviewerId: r.reviewerId,
        reviewerEmail: r.reviewerEmail,
        createdAt: r.createdAt,
        approvedAt: r.approvedAt,
        rejectedAt: r.rejectedAt,
        rejectedInFavorOfProposalId: r.rejectedInFavorOfProposalId,
        baseConfigVersion: r.baseConfigVersion,
        status: r.status,
      })),
    };
  };
}
