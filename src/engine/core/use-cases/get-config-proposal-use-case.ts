import {BadRequestError} from '../errors';
import type {TransactionalUseCase} from '../use-case';
import type {NormalizedEmail} from '../zod';

export interface GetConfigProposalRequest {
  proposalId: string;
  currentUserEmail: NormalizedEmail;
}

export interface ConfigProposalDetails {
  id: string;
  configId: string;
  configName: string;
  proposerId: number | null;
  proposerEmail: string | null;
  createdAt: Date;
  rejectedAt: Date | null;
  approvedAt: Date | null;
  reviewerId: number | null;
  reviewerEmail: string | null;
  rejectedInFavorOfProposalId: string | null;
  baseConfigVersion: number;
  proposedValue: {newValue: unknown} | null;
  proposedDescription: string | null;
  proposedSchema: {newSchema: unknown} | null;
  status: 'pending' | 'approved' | 'rejected';
}

export interface GetConfigProposalResponse {
  proposal: ConfigProposalDetails;
}

export interface GetConfigProposalUseCaseDeps {}

export function createGetConfigProposalUseCase(
  deps: GetConfigProposalUseCaseDeps,
): TransactionalUseCase<GetConfigProposalRequest, GetConfigProposalResponse> {
  return async (ctx, tx, req) => {
    const proposal = await tx.configProposals.getById(req.proposalId);
    if (!proposal) {
      throw new BadRequestError('Proposal not found');
    }

    // Get the config to retrieve its name
    const config = await tx.configs.getById(proposal.configId);
    if (!config) {
      throw new BadRequestError('Config not found');
    }

    // Get proposer details
    let proposerEmail: string | null = null;
    if (proposal.proposerId) {
      const proposer = await tx.users.getById(proposal.proposerId);
      proposerEmail = proposer?.email ?? null;
    }

    // Get reviewer details
    let reviewerEmail: string | null = null;
    if (proposal.reviewerId) {
      const reviewer = await tx.users.getById(proposal.reviewerId);
      reviewerEmail = reviewer?.email ?? null;
    }

    const status: 'pending' | 'approved' | 'rejected' = proposal.approvedAt
      ? 'approved'
      : proposal.rejectedAt
        ? 'rejected'
        : 'pending';

    return {
      proposal: {
        id: proposal.id,
        configId: proposal.configId,
        configName: config.name,
        proposerId: proposal.proposerId,
        proposerEmail,
        createdAt: proposal.createdAt,
        rejectedAt: proposal.rejectedAt,
        approvedAt: proposal.approvedAt,
        reviewerId: proposal.reviewerId,
        reviewerEmail,
        rejectedInFavorOfProposalId: proposal.rejectedInFavorOfProposalId,
        baseConfigVersion: proposal.baseConfigVersion,
        proposedValue: proposal.proposedValue,
        proposedDescription: proposal.proposedDescription,
        proposedSchema: proposal.proposedSchema,
        status,
      },
    };
  };
}
