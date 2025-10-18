import assert from 'assert';
import {createAuditMessageId} from '../audit-message-store';
import type {ConfigProposalId} from '../config-proposal-store';
import type {DateProvider} from '../date-provider';
import {BadRequestError} from '../errors';
import type {TransactionalUseCase} from '../use-case';
import type {NormalizedEmail} from '../zod';

export interface ApproveConfigProposalRequest {
  proposalId: ConfigProposalId;
  currentUserEmail: NormalizedEmail;
}

export interface ApproveConfigProposalResponse {}

export interface ApproveConfigProposalUseCaseDeps {
  dateProvider: DateProvider;
}

export function createApproveConfigProposalUseCase(
  deps: ApproveConfigProposalUseCaseDeps,
): TransactionalUseCase<ApproveConfigProposalRequest, ApproveConfigProposalResponse> {
  return async (ctx, tx, req) => {
    const proposal = await tx.configProposals.getById(req.proposalId);
    if (!proposal) {
      throw new BadRequestError('Proposal not found');
    }

    const currentUser = await tx.users.getByEmail(req.currentUserEmail);
    assert(currentUser, 'Current user not found');

    if (proposal.proposerId === currentUser.id) {
      throw new BadRequestError('Proposer cannot approve their own proposal');
    }

    // Check if already approved or rejected
    if (proposal.approvedAt) {
      throw new BadRequestError('Proposal has already been approved');
    }
    if (proposal.rejectedAt) {
      throw new BadRequestError('Proposal has already been rejected');
    }

    // proposer id might be null in if the user was deleted
    const patchAuthor = proposal.proposerId
      ? await tx.users.getById(proposal.proposerId)
      : currentUser;
    assert(patchAuthor, 'Patch author not found');

    // Get the config to check it exists
    const config = await tx.configs.getById(proposal.configId);
    if (!config) {
      throw new BadRequestError('Config not found');
    }

    // Mark the proposal as approved BEFORE patching
    await tx.configProposals.updateById({
      id: proposal.id,
      approvedAt: deps.dateProvider.now(),
      reviewerId: currentUser.id,
    });

    // Create audit message for the approval
    await tx.auditMessages.create({
      id: createAuditMessageId(),
      createdAt: deps.dateProvider.now(),
      userId: currentUser.id,
      projectId: config.projectId,
      configId: proposal.configId,
      payload: {
        type: 'config_proposal_approved',
        proposalId: proposal.id,
        configId: proposal.configId,
        proposedValue: proposal.proposedValue ?? undefined,
        proposedDescription: proposal.proposedDescription ?? undefined,
        proposedSchema: proposal.proposedSchema ?? undefined,
      },
    });

    await tx.configService.patchConfig({
      configId: proposal.configId,
      value: proposal.proposedValue ? {newValue: proposal.proposedValue.newValue} : undefined,
      schema: proposal.proposedSchema ? {newSchema: proposal.proposedSchema.newSchema} : undefined,
      description:
        proposal.proposedDescription !== null
          ? {newDescription: proposal.proposedDescription}
          : undefined,
      patchAuthor: patchAuthor,
      reviewer: currentUser,
      prevVersion: proposal.baseConfigVersion,
      originalProposalId: proposal.id,
    });

    return {};
  };
}
