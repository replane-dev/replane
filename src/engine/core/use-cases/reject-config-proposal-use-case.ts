import assert from 'assert';
import {createAuditLogId} from '../audit-log-store';
import type {ConfigProposalId} from '../config-proposal-store';
import type {DateProvider} from '../date-provider';
import {BadRequestError} from '../errors';
import type {TransactionalUseCase} from '../use-case';
import type {NormalizedEmail} from '../zod';

export interface RejectConfigProposalRequest {
  proposalId: ConfigProposalId;
  currentUserEmail: NormalizedEmail;
}

export interface RejectConfigProposalResponse {}

export interface RejectConfigProposalUseCaseDeps {
  dateProvider: DateProvider;
}

export function createRejectConfigProposalUseCase(
  deps: RejectConfigProposalUseCaseDeps,
): TransactionalUseCase<RejectConfigProposalRequest, RejectConfigProposalResponse> {
  return async (ctx, tx, req) => {
    const proposal = await tx.configProposals.getById(req.proposalId);
    if (!proposal) {
      throw new BadRequestError('Proposal not found');
    }

    const currentUser = await tx.users.getByEmail(req.currentUserEmail);
    assert(currentUser, 'Current user not found');

    // Check if already approved or rejected
    if (proposal.approvedAt) {
      throw new BadRequestError('Proposal has already been approved');
    }
    if (proposal.rejectedAt) {
      throw new BadRequestError('Proposal has already been rejected');
    }

    // Get the config to check it exists
    const config = await tx.configs.getById(proposal.configId);
    if (!config) {
      throw new BadRequestError('Config not found');
    }

    // Mark the proposal as rejected
    await tx.configProposals.updateById({
      id: proposal.id,
      rejectedAt: deps.dateProvider.now(),
      reviewerId: currentUser.id,
      rejectedInFavorOfProposalId: null,
      rejectionReason: 'rejected_explicitly',
    });

    // Create audit message for the rejection
    await tx.auditLogs.create({
      id: createAuditLogId(),
      createdAt: deps.dateProvider.now(),
      userId: currentUser.id,
      projectId: config.projectId,
      configId: proposal.configId,
      payload: {
        type: 'config_proposal_rejected',
        proposalId: proposal.id,
        configId: proposal.configId,
        rejectedInFavorOfProposalId: undefined,
        proposedDelete: proposal.proposedDelete || undefined,
        proposedDescription: proposal.proposedDescription ?? undefined,
        proposedMembers: proposal.proposedMembers ?? undefined,
      },
    });

    return {};
  };
}
