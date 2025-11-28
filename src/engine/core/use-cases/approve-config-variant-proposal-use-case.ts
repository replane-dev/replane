import assert from 'assert';
import {createAuditLogId} from '../audit-log-store';
import type {ConfigVariantProposalId} from '../config-variant-proposal-store';
import type {DateProvider} from '../date-provider';
import {BadRequestError, ForbiddenError} from '../errors';
import type {TransactionalUseCase} from '../use-case';
import type {NormalizedEmail} from '../zod';

export interface ApproveConfigVariantProposalRequest {
  proposalId: ConfigVariantProposalId;
  currentUserEmail: NormalizedEmail;
}

export interface ApproveConfigVariantProposalResponse {}

export interface ApproveConfigVariantProposalUseCaseDeps {
  dateProvider: DateProvider;
  allowSelfApprovals: boolean;
}

export function createApproveConfigVariantProposalUseCase(
  deps: ApproveConfigVariantProposalUseCaseDeps,
): TransactionalUseCase<ApproveConfigVariantProposalRequest, ApproveConfigVariantProposalResponse> {
  return async (ctx, tx, req) => {
    const proposal = await tx.configVariantProposals.getById(req.proposalId);
    if (!proposal) {
      throw new BadRequestError('Proposal not found');
    }

    const currentUser = await tx.users.getByEmail(req.currentUserEmail);
    assert(currentUser, 'Current user not found');

    if (!deps.allowSelfApprovals && proposal.proposerId === currentUser.id) {
      throw new ForbiddenError('Proposer cannot approve their own proposal');
    }

    // Check if already approved or rejected
    if (proposal.approvedAt) {
      throw new ForbiddenError('Proposal has already been approved');
    }
    if (proposal.rejectedAt) {
      throw new ForbiddenError('Proposal has already been rejected');
    }

    // proposer id might be null if the user was deleted
    const patchAuthor = proposal.proposerId
      ? await tx.users.getById(proposal.proposerId)
      : currentUser;
    assert(patchAuthor, 'Patch author not found');

    // Get the config variant to check it exists
    const configVariant = await tx.configVariants.getById(proposal.configVariantId);
    if (!configVariant) {
      throw new BadRequestError('Config variant not found');
    }

    // Get the config for the audit log
    const config = await tx.configs.getById(configVariant.configId);
    assert(config, 'Config not found');

    // Check version conflict
    if (configVariant.version !== proposal.baseVariantVersion) {
      throw new BadRequestError(
        `Config variant was edited since this proposal was created. Please refresh and create a new proposal.`,
      );
    }

    // Mark the proposal as approved BEFORE patching
    await tx.configVariantProposals.approve({
      id: proposal.id,
      approvedAt: deps.dateProvider.now(),
      reviewerId: currentUser.id,
    });

    // Create audit log for the approval
    await tx.auditLogs.create({
      id: createAuditLogId(),
      createdAt: deps.dateProvider.now(),
      userId: currentUser.id,
      projectId: config.projectId,
      configId: config.id,
      payload: {
        type: 'config_variant_proposal_approved',
        proposalId: proposal.id,
        configVariantId: proposal.configVariantId,
        configId: config.id,
        proposedValue:
          proposal.proposedValue !== undefined ? {newValue: proposal.proposedValue} : undefined,
        proposedSchema:
          proposal.proposedSchema !== undefined ? {newSchema: proposal.proposedSchema} : undefined,
        proposedOverrides:
          proposal.proposedOverrides !== undefined
            ? {newOverrides: proposal.proposedOverrides}
            : undefined,
      },
    });

    // Apply the changes via configService.patchConfigVariant
    // Note: undefined = no change, null = explicitly set to null
    await tx.configService.patchConfigVariant({
      configVariantId: proposal.configVariantId,
      value: proposal.proposedValue !== undefined ? {newValue: proposal.proposedValue} : undefined,
      schema:
        proposal.proposedSchema !== undefined ? {newSchema: proposal.proposedSchema} : undefined,
      overrides:
        proposal.proposedOverrides !== undefined
          ? {newOverrides: proposal.proposedOverrides}
          : undefined,
      patchAuthor: patchAuthor,
      reviewer: currentUser,
      originalProposalId: proposal.id,
      prevVersion: proposal.baseVariantVersion,
    });

    return {};
  };
}
