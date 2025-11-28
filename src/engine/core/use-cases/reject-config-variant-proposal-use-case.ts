import assert from 'assert';
import {createAuditLogId} from '../audit-log-store';
import type {ConfigVariantProposalId} from '../config-variant-proposal-store';
import type {DateProvider} from '../date-provider';
import {BadRequestError} from '../errors';
import type {TransactionalUseCase} from '../use-case';
import type {NormalizedEmail} from '../zod';

export interface RejectConfigVariantProposalRequest {
  proposalId: ConfigVariantProposalId;
  currentUserEmail: NormalizedEmail;
}

export interface RejectConfigVariantProposalResponse {}

export interface RejectConfigVariantProposalUseCaseDeps {
  dateProvider: DateProvider;
}

export function createRejectConfigVariantProposalUseCase(
  deps: RejectConfigVariantProposalUseCaseDeps,
): TransactionalUseCase<RejectConfigVariantProposalRequest, RejectConfigVariantProposalResponse> {
  return async (ctx, tx, req) => {
    const proposal = await tx.configVariantProposals.getById(req.proposalId);
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

    // Get the config variant to check it exists and get config info
    const configVariant = await tx.configVariants.getById(proposal.configVariantId);
    if (!configVariant) {
      throw new BadRequestError('Config variant not found');
    }

    // Get the config for the audit log
    const config = await tx.configs.getById(configVariant.configId);
    assert(config, 'Config not found');

    // Mark the proposal as rejected
    await tx.configVariantProposals.reject({
      id: proposal.id,
      rejectedAt: deps.dateProvider.now(),
      reviewerId: currentUser.id,
      reason: 'rejected_explicitly',
      rejectedInFavorOfProposalId: undefined,
    });

    // Create audit log for the rejection
    await tx.auditLogs.create({
      id: createAuditLogId(),
      createdAt: deps.dateProvider.now(),
      userId: currentUser.id,
      projectId: config.projectId,
      configId: config.id,
      payload: {
        type: 'config_variant_proposal_rejected',
        proposalId: proposal.id,
        configVariantId: proposal.configVariantId,
        configId: config.id,
        rejectedInFavorOfProposalId: undefined,
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

    return {};
  };
}
