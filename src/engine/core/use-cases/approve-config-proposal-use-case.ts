import assert from 'assert';
import type {DateProvider} from '../date-provider';
import {BadRequestError, ForbiddenError} from '../errors';
import {requireUserEmail, type Identity} from '../identity';
import {createAuditLogId} from '../stores/audit-log-store';
import type {ConfigProposalId} from '../stores/config-proposal-store';
import type {TransactionalUseCase} from '../use-case';

export interface ApproveConfigProposalRequest {
  proposalId: ConfigProposalId;
  projectId: string;
  identity: Identity;
}

export interface ApproveConfigProposalResponse {}

export interface ApproveConfigProposalUseCaseDeps {
  dateProvider: DateProvider;
  baseUrl: string;
}

export function createApproveConfigProposalUseCase(
  deps: ApproveConfigProposalUseCaseDeps,
): TransactionalUseCase<ApproveConfigProposalRequest, ApproveConfigProposalResponse> {
  return async (ctx, tx, req) => {
    // Approving proposals requires a user identity
    const currentUserEmail = requireUserEmail(req.identity);

    const proposal = await tx.configProposals.getById({
      id: req.proposalId,
      projectId: req.projectId,
    });
    if (!proposal) {
      throw new BadRequestError('Proposal not found');
    }

    const currentUser = await tx.users.getByEmail(currentUserEmail);
    assert(currentUser, 'Current user not found');

    // Get the config to check allowSelfApprovals
    const config = await tx.configs.getById(proposal.configId);
    if (!config) {
      throw new BadRequestError('Config not found');
    }

    // Get the project to check allowSelfApprovals setting
    const project = await tx.projects.getById({
      id: config.projectId,
      currentUserEmail,
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

    if (config.version !== proposal.baseConfigVersion) {
      throw new BadRequestError(
        'Config has been modified since this proposal was created. Please create a new proposal.',
      );
    }

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
        identity: req.identity,
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
        editAuthorId: proposal.authorId,
        reviewer: req.identity,
        prevVersion: proposal.baseConfigVersion,
        originalProposalId: proposal.id,
      });
    }

    let patchAuthorEmail: string | null = null;
    if (proposal.authorId) {
      const patchAuthor = await tx.users.getById(proposal.authorId);
      assert(patchAuthor, 'Patch author not found');
      patchAuthorEmail = patchAuthor.email;
    }

    // Send email notification to the proposal author
    if (tx.emailService && patchAuthorEmail) {
      const proposalUrl = `${deps.baseUrl}/app/projects/${project.id}/configs/${config.name}/proposals/${proposal.id}`;
      const configName = config.name;
      const projectName = project.name;
      const reviewerName = req.identity.identityName;
      const emailService = tx.emailService;

      tx.scheduleOptimisticEffect(async () => {
        await emailService.sendProposalApproved({
          to: patchAuthorEmail,
          proposalUrl,
          configName,
          projectName,
          reviewerName,
        });
      });
    }

    return {};
  };
}
