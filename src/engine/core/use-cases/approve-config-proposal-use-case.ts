import assert from 'assert';
import {createAuditLogId} from '../audit-log-store';
import type {ConfigProposalId} from '../config-proposal-store';
import type {DateProvider} from '../date-provider';
import {BadRequestError, ForbiddenError} from '../errors';
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

    // Get the config to check allowSelfApprovals
    const config = await tx.configs.getById(proposal.configId);
    if (!config) {
      throw new BadRequestError('Config not found');
    }

    // Get the project to check allowSelfApprovals setting
    const project = await tx.projects.getById({
      id: config.projectId,
      currentUserEmail: req.currentUserEmail,
    });
    if (!project) {
      throw new BadRequestError('Project not found');
    }

    if (!project.allowSelfApprovals && proposal.proposerId === currentUser.id) {
      throw new ForbiddenError('Proposer cannot approve their own proposal');
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

    assert(
      config.version === proposal.baseConfigVersion,
      "Config proposal version mismatch, even though all proposals must've be rejected after a config edit",
    );

    // Mark the proposal as approved BEFORE patching
    await tx.configProposals.updateById({
      id: proposal.id,
      approvedAt: deps.dateProvider.now(),
      reviewerId: currentUser.id,
    });

    // Create audit message for the approval
    await tx.auditLogs.create({
      id: createAuditLogId(),
      createdAt: deps.dateProvider.now(),
      userId: currentUser.id,
      projectId: config.projectId,
      configId: proposal.configId,
      payload: {
        type: 'config_proposal_approved',
        proposalId: proposal.id,
        configId: proposal.configId,
        proposedDelete: proposal.proposedDelete,
        proposedDescription: proposal.proposedDescription ?? undefined,
        proposedMembers: proposal.proposedMembers ?? undefined,
      },
    });

    // If this is a deletion proposal, delete the config and reject other pending proposals.
    if (proposal.proposedDelete) {
      await tx.configService.deleteConfig({
        configId: proposal.configId,
        deleteAuthor: patchAuthor,
        reviewer: currentUser,
        prevVersion: proposal.baseConfigVersion,
      });
    } else {
      // Apply config-level changes
      const hasConfigChanges =
        proposal.proposedDescription !== null || proposal.proposedMembers !== null;
      if (hasConfigChanges) {
        await tx.configService.patchConfig({
          configId: proposal.configId,
          description:
            proposal.proposedDescription !== null
              ? {newDescription: proposal.proposedDescription}
              : undefined,
          members: proposal.proposedMembers
            ? {newMembers: proposal.proposedMembers.newMembers}
            : undefined,
          patchAuthor: patchAuthor,
          reviewer: currentUser,
          prevVersion: proposal.baseConfigVersion,
          originalProposalId: proposal.id,
        });
      }

      // Apply variant-level changes
      const variantChanges = await tx.configProposals.getVariantsByProposalId(proposal.id);
      for (const variantChange of variantChanges) {
        // Verify variant version hasn't changed
        const variant = await tx.configVariants.getById(variantChange.configVariantId);
        assert(variant, `Variant ${variantChange.configVariantId} not found`);
        assert(
          variant.version === variantChange.baseVariantVersion,
          `Variant version mismatch for ${variantChange.configVariantId}`,
        );

        await tx.configService.patchConfigVariant({
          configVariantId: variantChange.configVariantId,
          value:
            variantChange.proposedValue !== undefined
              ? {newValue: variantChange.proposedValue}
              : undefined,
          schema:
            variantChange.proposedSchema !== undefined
              ? {newSchema: variantChange.proposedSchema}
              : undefined,
          overrides:
            variantChange.proposedOverrides !== undefined
              ? {newOverrides: variantChange.proposedOverrides}
              : undefined,
          patchAuthor: patchAuthor,
          reviewer: currentUser,
          prevVersion: variantChange.baseVariantVersion,
          originalProposalId: proposal.id,
        });
      }
    }

    return {};
  };
}
