import assert from 'assert';
import type {DateProvider} from './date-provider';
import type {ConfigProposalRejectionReason} from './db';
import type {EmailService} from './email-service';
import {BadRequestError} from './errors';
import {getUserIdFromIdentity, isUserIdentity, type Identity} from './identity';
import {createAuditLogId, type AuditLogStore} from './stores/audit-log-store';
import type {ConfigProposalStore} from './stores/config-proposal-store';
import type {Config, ConfigStore} from './stores/config-store';
import type {ProjectStore} from './stores/project-store';
import type {UserStore} from './user-store';

export interface ProposalServiceDeps {
  configProposals: ConfigProposalStore;
  configs: ConfigStore;
  projects: ProjectStore;
  users: UserStore;
  auditLogs: AuditLogStore;
  dateProvider: DateProvider;
  scheduleOptimisticEffect: (effect: () => Promise<void>) => void;
  emailService?: EmailService;
  baseUrl?: string;
}

export class ProposalService {
  constructor(private readonly deps: ProposalServiceDeps) {}

  /**
   * Rejects a single proposal explicitly.
   * Validates the proposal state and sends email notification to the author.
   */
  async rejectProposal(params: {
    proposalId: string;
    projectId: string;
    reviewer: Identity;
  }): Promise<void> {
    const {proposalId, projectId, reviewer} = params;

    const proposal = await this.deps.configProposals.getById({
      id: proposalId,
      projectId,
    });

    if (!proposal) {
      throw new BadRequestError('Proposal not found');
    }

    // Check if already approved or rejected
    if (proposal.approvedAt) {
      throw new BadRequestError('Proposal has already been approved');
    }
    if (proposal.rejectedAt) {
      throw new BadRequestError('Proposal has already been rejected');
    }

    // Get the config to check it exists
    const config = await this.deps.configs.getById({
      id: proposal.configId,
      projectId,
    });
    if (!config) {
      throw new BadRequestError('Config not found');
    }

    // Mark the proposal as rejected
    await this.deps.configProposals.updateById({
      id: proposal.id,
      projectId,
      rejectedAt: this.deps.dateProvider.now(),
      reviewerId: getUserIdFromIdentity(reviewer) ?? undefined,
      rejectedInFavorOfProposalId: null,
      rejectionReason: 'rejected_explicitly',
    });

    // Create audit message for the rejection
    await this.deps.auditLogs.create({
      id: createAuditLogId(),
      createdAt: this.deps.dateProvider.now(),
      userId: getUserIdFromIdentity(reviewer),
      projectId: config.projectId,
      configId: proposal.configId,
      payload: {
        type: 'config_proposal_rejected',
        proposalId: proposal.id,
        configId: proposal.configId,
        rejectedInFavorOfProposalId: undefined,
        proposedDelete: proposal.isDelete || undefined,
        proposedDescription: proposal.description ?? undefined,
        proposedMembers: proposal.members ?? undefined,
      },
    });

    // Send email notification to the proposal author
    await this.scheduleRejectionNotification({
      proposal,
      config,
      reviewer,
      rejectedInFavorOfProposalId: undefined,
    });
  }

  /**
   * Rejects all pending proposals for a config.
   */
  async rejectAllPendingProposals(params: {
    configId: string;
    projectId: string;
    reviewer: Identity;
  }): Promise<void> {
    const config = await this.deps.configs.getById({
      id: params.configId,
      projectId: params.projectId,
    });
    if (!config) {
      throw new BadRequestError('Config not found');
    }

    await this.rejectConfigProposalsInternal({
      configId: params.configId,
      reviewer: params.reviewer,
      existingConfig: config,
      originalProposalId: undefined,
      rejectionReason: 'rejected_explicitly',
    });
  }

  /**
   * Rejects all pending proposals for a config (internal method used by ConfigService).
   * Can optionally exclude a proposal that was just approved.
   */
  async rejectConfigProposalsInternal(params: {
    configId: string;
    originalProposalId?: string;
    existingConfig: Config;
    reviewer: Identity;
    rejectionReason: ConfigProposalRejectionReason;
  }): Promise<void> {
    const {reviewer, existingConfig} = params;

    if (params.originalProposalId) {
      const proposal = await this.deps.configProposals.getById({
        id: params.originalProposalId,
        projectId: existingConfig.projectId,
      });

      assert(proposal, 'Proposal to reject in favor of not found');
      assert(proposal.configId === params.configId, 'Config ID must match the proposal config ID');
      assert(proposal.rejectedAt === null, 'Proposal to reject in favor of is already rejected');
      assert(proposal.approvedAt !== null, 'Proposal to reject in favor of is not approved yet');

      if (isUserIdentity(reviewer)) {
        assert(
          proposal.reviewerId === reviewer.user.id,
          'Reviewer must match the proposal reviewer',
        );
      }
    }

    // Get all pending config proposals for this config
    const pendingProposals = await this.deps.configProposals.getPendingProposals({
      configId: params.configId,
      projectId: existingConfig.projectId,
    });

    // Reject all pending config proposals
    for (const proposalInfo of pendingProposals) {
      assert(
        !proposalInfo.approvedAt && !proposalInfo.rejectedAt,
        'Proposal should not be approved or rejected',
      );

      // Fetch full proposal details for audit message
      const proposal = await this.deps.configProposals.getById({
        id: proposalInfo.id,
        projectId: existingConfig.projectId,
      });
      assert(proposal, 'Proposal must exist');

      await this.deps.configProposals.updateById({
        id: proposal.id,
        projectId: existingConfig.projectId,
        rejectedAt: this.deps.dateProvider.now(),
        reviewerId: getUserIdFromIdentity(reviewer) ?? undefined,
        rejectedInFavorOfProposalId: params.originalProposalId ?? null,
        rejectionReason: params.rejectionReason,
      });

      // Create audit log for the rejection
      await this.deps.auditLogs.create({
        id: createAuditLogId(),
        createdAt: this.deps.dateProvider.now(),
        userId: getUserIdFromIdentity(reviewer),
        projectId: existingConfig.projectId,
        configId: params.configId,
        payload: {
          type: 'config_proposal_rejected',
          proposalId: proposal.id,
          configId: params.configId,
          rejectedInFavorOfProposalId: params.originalProposalId ?? undefined,
          proposedDelete: proposal.isDelete ?? undefined,
          proposedDescription: proposal.description ?? undefined,
          proposedMembers: proposal.members ?? undefined,
        },
      });

      // Schedule rejection notification
      await this.scheduleRejectionNotification({
        proposal,
        config: existingConfig,
        reviewer,
        rejectedInFavorOfProposalId: params.originalProposalId,
      });
    }
  }

  /**
   * Schedules an email notification for a rejected proposal.
   */
  private async scheduleRejectionNotification(params: {
    proposal: {id: string; authorId: number | null};
    config: Config;
    reviewer: Identity;
    rejectedInFavorOfProposalId?: string;
  }): Promise<void> {
    const {proposal, config, reviewer} = params;

    if (!this.deps.emailService || !this.deps.baseUrl || !proposal.authorId) {
      return;
    }

    const author = await this.deps.users.getById(proposal.authorId);
    if (!author || !author.email) {
      return;
    }

    const project = await this.deps.projects.getByIdWithoutPermissionCheck(config.projectId);

    if (!project) {
      return;
    }

    const proposalUrl = `${this.deps.baseUrl}/app/projects/${project.id}/configs/${config.name}/proposals/${proposal.id}`;
    const authorEmail = author.email;
    const configName = config.name;
    const projectName = project.name;
    const emailService = this.deps.emailService;

    this.deps.scheduleOptimisticEffect(async () => {
      await emailService.sendProposalRejected({
        to: authorEmail,
        proposalUrl,
        configName,
        projectName,
        reviewerName: reviewer.identityName,
      });
    });
  }
}
