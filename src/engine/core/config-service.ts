import assert from 'assert';
import {createAuditLogId, type AuditLog, type AuditLogStore} from './audit-log-store';
import type {ConfigProposalStore} from './config-proposal-store';
import type {Config, ConfigId, ConfigStore} from './config-store';
import type {ConfigUserStore} from './config-user-store';
import type {ConfigVariantStore} from './config-variant-store';
import type {ConfigVariantVersionStore} from './config-variant-version-store';
import type {DateProvider} from './date-provider';
import type {ConfigProposalRejectionReason} from './db';
import {BadRequestError} from './errors';
import {diffMembers} from './member-diff';
import type {Override} from './override-condition-schemas';
import type {PermissionService} from './permission-service';
import type {ProjectEnvironmentStore} from './project-environment-store';
import type {User} from './user-store';
import {normalizeEmail, validateAgainstJsonSchema} from './utils';
import {createUuidV7} from './uuid';
import {validateOverrideReferences} from './validate-override-references';
import type {ConfigMember} from './zod';

export interface PatchConfigParams {
  configId: ConfigId;
  description?: {newDescription: string};
  members?: {newMembers: ConfigMember[]};
  patchAuthor: User;
  reviewer: User;
  originalProposalId?: string;
  prevVersion: number;
}

export interface PatchConfigVariantParams {
  configVariantId: string;
  value?: {newValue: any};
  schema?: {newSchema: any};
  overrides?: {newOverrides: Override[]};
  patchAuthor: User;
  reviewer: User;
  originalProposalId?: string;
  prevVersion: number;
}

export interface DeleteConfigParams {
  configId: ConfigId;
  deleteAuthor: User;
  reviewer: User;
  originalProposalId?: string;
  prevVersion: number;
}

export class ConfigService {
  constructor(
    private readonly configs: ConfigStore,
    private readonly configProposals: ConfigProposalStore,
    private readonly configUsers: ConfigUserStore,
    private readonly permissionService: PermissionService,
    private readonly auditLogs: AuditLogStore,
    private readonly dateProvider: DateProvider,
    private readonly projectEnvironments: ProjectEnvironmentStore,
    private readonly configVariants: ConfigVariantStore,
    private readonly configVariantVersions: ConfigVariantVersionStore,
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
      throw new BadRequestError('Config does not exist');
    }

    const {patchAuthor, reviewer} = params;
    assert(patchAuthor.email, 'Patch author must have an email');
    assert(reviewer.email, 'Reviewer must have an email');

    // Check version conflict
    if (existingConfig.version !== params.prevVersion) {
      throw new BadRequestError(`Config was edited by another user. Please, refresh the page.`);
    }

    // Config-level patches (description, members) always require manage permission
    if (params.members || params.description) {
      await this.permissionService.ensureCanManageConfig(
        existingConfig.id,
        normalizeEmail(reviewer.email),
      );
    }

    // Reject all pending CONFIG proposals (not variant proposals)
    await this.rejectConfigProposalsInternal({
      configId: existingConfig.id,
      originalProposalId: params.originalProposalId,
      existingConfig,
      reviewer,
      rejectionReason: params.originalProposalId ? 'another_proposal_approved' : 'config_edited',
    });

    const nextDescription = params.description
      ? params.description.newDescription
      : existingConfig.description;
    const nextVersion = existingConfig.version + 1;

    const beforeConfig = existingConfig;

    // Update description if changed
    if (params.description) {
      await this.configs.updateDescription({
        id: existingConfig.id,
        description: nextDescription,
        version: nextVersion,
      });
    }

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

    // Only create audit logs if something actually changed
    if (params.description) {
      const baseLog: AuditLog = {
        id: createAuditLogId(),
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
            description: beforeConfig.description,
            creatorId: beforeConfig.creatorId,
            createdAt: beforeConfig.createdAt,
            version: beforeConfig.version,
          },
          after: {
            id: afterConfig.id,
            projectId: afterConfig.projectId,
            name: afterConfig.name,
            description: afterConfig.description,
            creatorId: afterConfig.creatorId,
            createdAt: afterConfig.createdAt,
            version: afterConfig.version,
          },
        },
      };
      await this.auditLogs.create(baseLog);
    }

    if (membersDiff && membersDiff.added.length + membersDiff.removed.length > 0) {
      await this.auditLogs.create({
        id: createAuditLogId(),
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
            description: afterConfig.description,
            creatorId: afterConfig.creatorId,
            createdAt: afterConfig.createdAt,
            version: afterConfig.version,
          },
          added: membersDiff.added,
          removed: membersDiff.removed,
        },
      });
    }
  }

  async patchConfigVariant(params: PatchConfigVariantParams): Promise<void> {
    const existingVariant = await this.configVariants.getById(params.configVariantId);
    if (!existingVariant) {
      throw new BadRequestError('Config variant does not exist');
    }

    const config = await this.configs.getById(existingVariant.configId);
    if (!config) {
      throw new BadRequestError('Config does not exist');
    }

    const {patchAuthor, reviewer} = params;
    assert(patchAuthor.email, 'Patch author must have an email');
    assert(reviewer.email, 'Reviewer must have an email');

    // Check version conflict
    if (existingVariant.version !== params.prevVersion) {
      throw new BadRequestError(
        `Config variant was edited by another user. Please, refresh the page.`,
      );
    }

    // Schema changes require maintainer permission, other changes require at least edit permission
    if (params.schema) {
      await this.permissionService.ensureCanManageConfig(config.id, normalizeEmail(reviewer.email));
    } else {
      await this.permissionService.ensureCanEditConfig(config.id, normalizeEmail(reviewer.email));
    }

    const nextValue = params.value ? params.value.newValue : existingVariant.value;
    const nextSchema = params.schema ? params.schema.newSchema : existingVariant.schema;
    const nextOverrides = params.overrides
      ? params.overrides.newOverrides
      : existingVariant.overrides;

    // Validate schema if present
    if (nextSchema !== null) {
      const result = validateAgainstJsonSchema(nextValue, nextSchema);
      if (!result.ok) {
        throw new BadRequestError(
          `Config value does not match schema: ${result.errors.join('; ')}`,
        );
      }
    }

    // Validate override references use the same project ID
    validateOverrideReferences({
      overrides: nextOverrides,
      configProjectId: config.projectId,
    });

    const nextVersion = existingVariant.version + 1;

    // Update the variant
    await this.configVariants.update({
      id: existingVariant.id,
      value: nextValue,
      schema: nextSchema,
      overrides: nextOverrides,
      version: nextVersion,
      updatedAt: this.dateProvider.now(),
    });

    // Create variant version history
    await this.configVariantVersions.create({
      id: createUuidV7(),
      configVariantId: existingVariant.id,
      version: nextVersion,
      name: config.name,
      description: config.description,
      value: nextValue,
      schema: nextSchema,
      overrides: nextOverrides,
      authorId: patchAuthor.id ?? null,
      proposalId: params.originalProposalId ?? null,
      createdAt: this.dateProvider.now(),
    });

    // Reject all pending CONFIG proposals (variant change invalidates config proposals)
    await this.rejectConfigProposalsInternal({
      configId: config.id,
      originalProposalId: params.originalProposalId,
      existingConfig: config,
      reviewer,
      rejectionReason: params.originalProposalId ? 'another_proposal_approved' : 'config_edited',
    });

    // Get environment information for audit log
    const environment = await this.projectEnvironments.getById(existingVariant.environmentId);
    assert(environment, `Environment ${existingVariant.environmentId} not found`);

    // Create audit log for variant update
    await this.auditLogs.create({
      id: createAuditLogId(),
      createdAt: this.dateProvider.now(),
      userId: patchAuthor.id,
      configId: config.id,
      projectId: config.projectId,
      payload: {
        type: 'config_variant_updated',
        before: {
          id: existingVariant.id,
          configId: existingVariant.configId,
          configName: config.name,
          environmentId: existingVariant.environmentId,
          environmentName: environment.name,
          value: existingVariant.value,
          schema: existingVariant.schema,
          overrides: existingVariant.overrides,
          version: existingVariant.version,
        },
        after: {
          id: existingVariant.id,
          configId: existingVariant.configId,
          configName: config.name,
          environmentId: existingVariant.environmentId,
          environmentName: environment.name,
          value: nextValue,
          schema: nextSchema,
          overrides: nextOverrides,
          version: nextVersion,
        },
      },
    });
  }

  async deleteConfig(params: DeleteConfigParams): Promise<void> {
    const existingConfig = await this.configs.getById(params.configId);
    if (!existingConfig) {
      throw new BadRequestError('Config does not exist');
    }

    if (existingConfig.version !== params.prevVersion) {
      throw new BadRequestError(`Config was edited by another user. Please, refresh the page.`);
    }

    // Manage permission is required to delete a config
    assert(params.reviewer.email, 'Reviewer must have an email');
    await this.permissionService.ensureCanManageConfig(
      existingConfig.id,
      normalizeEmail(params.reviewer.email),
    );

    // Reject all pending CONFIG proposals
    await this.rejectConfigProposalsInternal({
      configId: existingConfig.id,
      originalProposalId: params.originalProposalId,
      existingConfig,
      reviewer: params.reviewer,
      rejectionReason: params.originalProposalId ? 'another_proposal_approved' : 'config_deleted',
    });

    // Delete each variant (triggers notifications)
    const variants = await this.configVariants.getByConfigId(existingConfig.id);
    for (const variant of variants) {
      await this.configVariants.delete(variant.id);
    }

    // Delete the config metadata
    await this.configs.deleteById(existingConfig.id);

    // One audit log for config deletion (not per environment)
    await this.auditLogs.create({
      id: createAuditLogId(),
      createdAt: this.dateProvider.now(),
      userId: params.deleteAuthor.id ?? null,
      configId: null,
      projectId: existingConfig.projectId,
      payload: {
        type: 'config_deleted',
        config: {
          id: existingConfig.id,
          projectId: existingConfig.projectId,
          name: existingConfig.name,
          description: existingConfig.description,
          creatorId: existingConfig.creatorId,
          createdAt: existingConfig.createdAt,
          version: existingConfig.version,
        },
      },
    });
  }

  /**
   * Rejects all pending proposals for a config.
   * This is a public method that can be called directly from use cases.
   */
  async rejectAllPendingProposals(params: {configId: string; reviewer: User}): Promise<void> {
    const config = await this.configs.getById(params.configId);
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

  private async rejectConfigProposalsInternal(params: {
    configId: string;
    originalProposalId?: string;
    existingConfig: Config;
    reviewer: User;
    rejectionReason: ConfigProposalRejectionReason;
  }): Promise<void> {
    const {reviewer, existingConfig} = params;

    if (params.originalProposalId) {
      const proposal = await this.configProposals.getById(params.originalProposalId);

      assert(proposal, 'Proposal to reject in favor of not found');
      assert(proposal.configId === params.configId, 'Config ID must match the proposal config ID');
      assert(proposal.reviewerId === reviewer.id, 'Reviewer must match the proposal reviewer');
      assert(proposal.rejectedAt === null, 'Proposal to reject in favor of is already rejected');
      assert(proposal.approvedAt !== null, 'Proposal to reject in favor of is not approved yet');
    }

    // Get all pending config proposals for this config
    const pendingProposals = await this.configProposals.getPendingProposals({
      configId: params.configId,
    });

    // Reject all pending config proposals
    for (const proposalInfo of pendingProposals) {
      assert(
        !proposalInfo.approvedAt && !proposalInfo.rejectedAt,
        'Proposal should not be approved or rejected',
      );

      // Fetch full proposal details for audit message
      const proposal = await this.configProposals.getById(proposalInfo.id);
      assert(proposal, 'Proposal must exist');

      await this.configProposals.updateById({
        id: proposal.id,
        rejectedAt: this.dateProvider.now(),
        reviewerId: reviewer.id,
        rejectedInFavorOfProposalId: params.originalProposalId ?? null,
        rejectionReason: params.rejectionReason,
      });

      // Create audit log for the rejection
      await this.auditLogs.create({
        id: createAuditLogId(),
        createdAt: this.dateProvider.now(),
        userId: reviewer.id,
        projectId: existingConfig.projectId,
        configId: params.configId,
        payload: {
          type: 'config_proposal_rejected',
          proposalId: proposal.id,
          configId: params.configId,
          rejectedInFavorOfProposalId: params.originalProposalId ?? undefined,
          proposedDelete: proposal.proposedDelete ?? undefined,
          proposedDescription: proposal.proposedDescription ?? undefined,
          proposedMembers: proposal.proposedMembers ?? undefined,
        },
      });
    }
  }
}
