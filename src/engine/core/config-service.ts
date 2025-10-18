import assert from 'assert';
import {
  createAuditMessageId,
  type AuditMessage,
  type AuditMessageStore,
} from './audit-message-store';
import type {ConfigProposalStore} from './config-proposal-store';
import type {ConfigId, ConfigStore} from './config-store';
import type {ConfigUserStore} from './config-user-store';
import {createConfigVersionId, type ConfigVersionStore} from './config-version-store';
import type {DateProvider} from './date-provider';
import {BadRequestError} from './errors';
import {diffMembers} from './member-diff';
import type {PermissionService} from './permission-service';
import type {User} from './user-store';
import {normalizeEmail, validateAgainstJsonSchema} from './utils';
import type {ConfigMember} from './zod';

export interface PatchConfigParams {
  configId: ConfigId;
  value?: {newValue: any};
  schema?: {newSchema: any};
  description?: {newDescription: string};
  patchAuthor: User;
  reviewer: User;
  originalProposalId?: string;
  members?: {newMembers: ConfigMember[]};
  prevVersion: number;
}

export class ConfigService {
  constructor(
    private readonly configs: ConfigStore,
    private readonly configProposals: ConfigProposalStore,
    private readonly configUsers: ConfigUserStore,
    private readonly configVersions: ConfigVersionStore,
    private readonly permissionService: PermissionService,
    private readonly auditMessages: AuditMessageStore,
    private readonly dateProvider: DateProvider,
  ) {}

  /**
   * Validates that no user appears with multiple roles.
   * Throws BadRequestError if duplicates are found.
   */
  ensureUniqueMembers(members: Array<{email: string; role: string}>): void {
    if (members.length !== new Set(members.map(m => normalizeEmail(m.email))).size) {
      throw new BadRequestError(`Users cannot have multiple roles in the same config.`);
    }
  }

  async patchConfig(params: PatchConfigParams): Promise<void> {
    const existingConfig = await this.configs.getById(params.configId);
    if (!existingConfig) {
      throw new BadRequestError('Config with this name does not exist');
    }

    const {patchAuthor, reviewer} = params;
    assert(patchAuthor.email, 'Patch author must have an email');
    assert(reviewer.email, 'Reviewer must have an email');

    if (params.members || params.schema) {
      await this.permissionService.ensureCanManageConfig(
        existingConfig.id,
        normalizeEmail(reviewer.email),
      );
    } else {
      await this.permissionService.ensureCanEditConfig(
        existingConfig.id,
        normalizeEmail(reviewer.email),
      );
    }

    if (existingConfig.version !== params.prevVersion) {
      throw new BadRequestError(`Config was edited by another user. Please, refresh the page.`);
    }

    if (params.originalProposalId) {
      const proposal = await this.configProposals.getById(params.originalProposalId);

      assert(proposal, 'Proposal to reject in favor of not found');
      assert(proposal.configId === params.configId, 'Config ID must match the proposal config ID');
      assert(
        proposal.baseConfigVersion === existingConfig.version,
        'Base config version must match',
      );
      assert(proposal.reviewerId === reviewer.id, 'Reviewer must match the proposal reviewer');
      assert(proposal.rejectedAt === null, 'Proposal to reject in favor of is already rejected');
      assert(proposal.approvedAt !== null, 'Proposal to reject in favor of is not approved yet');
    }

    // Get all other pending proposals for this config
    const pendingProposals = await this.configProposals.getPendingProposals({
      configId: params.configId,
    });

    // Reject all other pending proposals
    for (const proposalInfo of pendingProposals) {
      // Fetch full proposal details for audit message
      const proposal = await this.configProposals.getById(proposalInfo.id);
      assert(proposal, 'Proposal must exist');

      await this.configProposals.updateById({
        id: proposal.id,
        rejectedAt: this.dateProvider.now(),
        reviewerId: reviewer.id,
        rejectedInFavorOfProposalId: params.originalProposalId,
      });

      // Create audit message for the rejection
      await this.auditMessages.create({
        id: createAuditMessageId(),
        createdAt: this.dateProvider.now(),
        userId: reviewer.id,
        projectId: existingConfig.projectId,
        configId: params.configId,
        payload: {
          type: 'config_proposal_rejected',
          proposalId: proposal.id,
          configId: params.configId,
          rejectedInFavorOfProposalId: params.originalProposalId,
          proposedValue: proposal.proposedValue ?? undefined,
          proposedDescription: proposal.proposedDescription ?? undefined,
          proposedSchema: proposal.proposedSchema ?? undefined,
        },
      });
    }

    const nextValue = params.value ? params.value.newValue : existingConfig.value;
    const nextSchema = params.schema ? params.schema.newSchema : existingConfig.schema;
    if (nextSchema !== null) {
      const result = validateAgainstJsonSchema(nextValue, nextSchema);
      if (!result.ok) {
        throw new BadRequestError(
          `Config value does not match schema: ${result.errors.join('; ')}`,
        );
      }
    }
    const nextDescription = params.description
      ? params.description.newDescription
      : existingConfig.description;
    const nextVersion = existingConfig.version + 1;

    const beforeConfig = existingConfig;

    await this.configs.updateById({
      id: existingConfig.id,
      value: nextValue,
      schema: nextSchema,
      description: nextDescription,
      updatedAt: this.dateProvider.now(),
      version: nextVersion,
    });

    await this.configVersions.create({
      configId: existingConfig.id,
      createdAt: this.dateProvider.now(),
      description: nextDescription,
      id: createConfigVersionId(),
      name: existingConfig.name,
      schema: nextSchema,
      value: nextValue,
      version: nextVersion,
      authorId: patchAuthor.id ?? null,
      proposalId: params.originalProposalId ?? null,
    });

    let membersDiff: {
      added: Array<{email: string; role: string}>;
      removed: Array<{email: string; role: string}>;
    } | null = null;
    if (params.members) {
      // Validate no user appears with multiple roles
      this.ensureUniqueMembers(params.members.newMembers);

      const existingConfigUsers = await this.configUsers.getByConfigId(existingConfig.id);
      const {added, removed} = diffMembers(
        existingConfigUsers.map(u => ({email: u.user_email_normalized, role: u.role})),
        params.members.newMembers,
      );

      // delete first to avoid unique constraint violations
      for (const user of removed) {
        await this.configUsers.delete(existingConfig.id, user.email);
      }
      await this.configUsers.create(
        added.map(x => ({
          configId: existingConfig.id,
          email: x.email,
          role: x.role,
          createdAt: this.dateProvider.now(),
          updatedAt: this.dateProvider.now(),
        })),
      );
      membersDiff = {
        added: added.map(a => ({email: a.email, role: a.role})),
        removed: removed.map(r => ({email: r.email, role: r.role})),
      };
    }

    const afterConfig = await this.configs.getById(existingConfig.id);

    assert(afterConfig, 'Config must exist after update');

    const baseMessage: AuditMessage = {
      id: createAuditMessageId(),
      createdAt: this.dateProvider.now(),
      userId: patchAuthor.id,
      projectId: afterConfig.projectId,
      configId: afterConfig.id,
      payload: {
        type: 'config_updated',
        before: {
          id: beforeConfig.id,
          projectId: beforeConfig.projectId,
          name: beforeConfig.name,
          value: beforeConfig.value,
          schema: beforeConfig.schema,
          description: beforeConfig.description,
          creatorId: beforeConfig.creatorId,
          createdAt: beforeConfig.createdAt,
          updatedAt: beforeConfig.updatedAt,
          version: beforeConfig.version,
        },
        after: {
          id: afterConfig.id,
          projectId: afterConfig.projectId,
          name: afterConfig.name,
          value: afterConfig.value,
          schema: afterConfig.schema,
          description: afterConfig.description,
          creatorId: afterConfig.creatorId,
          createdAt: afterConfig.createdAt,
          updatedAt: afterConfig.updatedAt,
          version: afterConfig.version,
        },
      },
    };
    await this.auditMessages.create(baseMessage);

    if (membersDiff && membersDiff.added.length + membersDiff.removed.length > 0) {
      await this.auditMessages.create({
        id: createAuditMessageId(),
        projectId: afterConfig.projectId,
        createdAt: this.dateProvider.now(),
        userId: patchAuthor.id,
        configId: afterConfig.id,
        payload: {
          type: 'config_members_changed',
          config: {
            id: afterConfig.id,
            projectId: afterConfig.projectId,
            name: afterConfig.name,
            value: afterConfig.value,
            schema: afterConfig.schema,
            description: afterConfig.description,
            creatorId: afterConfig.creatorId,
            createdAt: afterConfig.createdAt,
            updatedAt: afterConfig.updatedAt,
            version: afterConfig.version,
          },
          added: membersDiff.added,
          removed: membersDiff.removed,
        },
      });
    }
  }
}
