import assert from 'assert';
import type {DateProvider} from '../date-provider';
import {BadRequestError, ForbiddenError} from '../errors';
import {createAuditLogId} from '../stores/audit-log-store';
import type {ConfigProposalId} from '../stores/config-proposal-store';
import type {TransactionalUseCase} from '../use-case';
import type {NormalizedEmail} from '../zod';

export interface ApproveConfigProposalRequest {
  proposalId: ConfigProposalId;
  projectId: string;
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
    const proposal = await tx.configProposals.getById({
      id: req.proposalId,
      projectId: req.projectId,
    });
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

    if (!project.allowSelfApprovals && proposal.authorId === currentUser.id) {
      throw new ForbiddenError('Author cannot approve their own proposal');
    }

    // Check if already approved or rejected
    if (proposal.approvedAt) {
      throw new BadRequestError('Proposal has already been approved');
    }
    if (proposal.rejectedAt) {
      throw new BadRequestError('Proposal has already been rejected');
    }

    // author id might be null if the user was deleted
    const patchAuthor = proposal.authorId ? await tx.users.getById(proposal.authorId) : currentUser;
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
        proposedDelete: proposal.isDelete,
        proposedDescription: proposal.description ?? undefined,
        proposedMembers: proposal.members ?? undefined,
      },
    });

    // If this is a deletion proposal, delete the config and reject other pending proposals.
    if (proposal.isDelete) {
      await tx.configService.deleteConfig(ctx, {
        configId: proposal.configId,
        deleteAuthor: patchAuthor,
        reviewer: currentUser,
        prevVersion: proposal.baseConfigVersion,
        originalProposalId: proposal.id,
      });
    } else {
      // Extract members from proposal.members
      const editorEmails =
        proposal.members?.filter(m => m.role === 'editor').map(m => m.email) ?? [];
      const maintainerEmails =
        proposal.members?.filter(m => m.role === 'maintainer').map(m => m.email) ?? [];

      // Apply the full proposed state using updateConfig
      await tx.configService.updateConfig(ctx, {
        configId: proposal.configId,
        description: proposal.description ?? config.description,
        editorEmails,
        maintainerEmails,
        defaultVariant: {
          value: proposal.value,
          schema: proposal.schema,
          overrides: proposal.overrides,
        },
        environmentVariants: proposal.variants,
        currentUser: patchAuthor,
        reviewer: currentUser,
        prevVersion: proposal.baseConfigVersion,
        originalProposalId: proposal.id,
      });
    }

    return {};
  };
}
