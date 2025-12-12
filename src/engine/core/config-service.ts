import assert from 'assert';
import type {Context} from './context';
import type {DateProvider} from './date-provider';
import type {ConfigProposalRejectionReason} from './db';
import {BadRequestError} from './errors';
import {diffMembers} from './member-diff';
import type {Override} from './override-condition-schemas';
import type {PermissionService} from './permission-service';
import {createAuditLogId, type AuditLogStore} from './stores/audit-log-store';
import type {ConfigProposalStore} from './stores/config-proposal-store';
import type {Config, ConfigId, ConfigStore} from './stores/config-store';
import type {ConfigUserStore} from './stores/config-user-store';
import type {ConfigVariantStore} from './stores/config-variant-store';
import type {ConfigVariantVersionStore} from './stores/config-variant-version-store';
import type {ProjectEnvironmentStore} from './stores/project-environment-store';
import type {User} from './user-store';
import {normalizeEmail, validateAgainstJsonSchema} from './utils';
import {createUuidV7} from './uuid';
import {validateOverrideReferences} from './validate-override-references';
import type {ConfigMember, ConfigSchema, ConfigValue} from './zod';

export interface UpdateConfigParams {
  configId: string;
  description: string;
  editorEmails: string[];
  maintainerEmails: string[];
  defaultVariant?: {value: ConfigValue; schema: ConfigSchema | null; overrides: Override[]};
  environmentVariants: Array<{
    environmentId: string;
    value: ConfigValue;
    schema: ConfigSchema | null;
    overrides: Override[];
    useDefaultSchema: boolean;
  }>;
  currentUser: User;
  reviewer: User;
  prevVersion: number;
  originalProposalId?: string;
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

  /**
   * Validates a config state without persisting it.
   * Checks schema validation, override references, etc.
   */
  async validate(
    ctx: Context,
    config: {
      projectId: string;
      description: string;
      defaultVariant: {value: unknown; schema: unknown | null; overrides: Override[]} | null;
      environmentVariants: Array<{
        environmentId: string;
        value: unknown;
        schema: unknown | null;
        overrides: Override[];
        useDefaultSchema?: boolean;
      }>;
    },
  ): Promise<void> {
    // Validate default variant if provided
    if (config.defaultVariant) {
      // Validate default variant value against its schema
      if (config.defaultVariant.schema !== null && config.defaultVariant.schema !== undefined) {
        const result = validateAgainstJsonSchema(
          config.defaultVariant.value,
          config.defaultVariant.schema as any,
        );
        if (!result.ok) {
          throw new BadRequestError(
            `Default variant value does not match schema: ${result.errors.join('; ')}`,
          );
        }
      }

      // Validate default variant override references
      validateOverrideReferences({
        overrides: config.defaultVariant.overrides,
        configProjectId: config.projectId,
      });
    }

    // Validate environment variants
    for (const envVariant of config.environmentVariants) {
      // Determine which schema to use for validation
      let schemaForValidation = envVariant.schema;

      if (envVariant.useDefaultSchema) {
        if (!config.defaultVariant) {
          throw new BadRequestError(
            'Cannot use default schema when no default variant is provided',
          );
        }
        schemaForValidation = config.defaultVariant.schema;
      }

      // Validate environment variant value against schema
      if (schemaForValidation !== null && schemaForValidation !== undefined) {
        const result = validateAgainstJsonSchema(envVariant.value, schemaForValidation as any);
        if (!result.ok) {
          throw new BadRequestError(
            `Environment variant value does not match schema: ${result.errors.join('; ')}`,
          );
        }
      }

      // Validate environment variant override references
      validateOverrideReferences({
        overrides: envVariant.overrides,
        configProjectId: config.projectId,
      });
    }
  }

  /**
   * Updates a config to a new full state.
   * Compares with current state to determine what changed and what permissions are required.
   * Creates/updates/deletes variants as needed.
   */
  async updateConfig(ctx: Context, params: UpdateConfigParams): Promise<void> {
    const existingConfig = await this.configs.getById(params.configId);
    if (!existingConfig) {
      throw new BadRequestError('Config does not exist');
    }

    const {currentUser, reviewer} = params;
    assert(currentUser.email, 'Current user must have an email');
    assert(reviewer.email, 'Reviewer must have an email');

    // Check version conflict
    if (existingConfig.version !== params.prevVersion) {
      throw new BadRequestError(`Config was edited by another user. Please, refresh the page.`);
    }

    // Fetch all current variants
    const currentVariants = await this.configVariants.getByConfigId(params.configId);

    // Separate default and environment variants
    const currentDefaultVariant = currentVariants.find(v => v.environmentId === null);
    const currentEnvVariants = currentVariants.filter(v => v.environmentId !== null);

    // Determine what changed
    const descriptionChanged = params.description !== existingConfig.description;

    // Check if members changed
    const currentMembers = await this.configUsers.getByConfigId(params.configId);
    const currentEditors = currentMembers
      .filter(m => m.role === 'editor')
      .map(m => m.user_email_normalized);
    const currentMaintainers = currentMembers
      .filter(m => m.role === 'maintainer')
      .map(m => m.user_email_normalized);

    const membersChanged =
      JSON.stringify([...params.editorEmails].sort()) !==
        JSON.stringify([...currentEditors].sort()) ||
      JSON.stringify([...params.maintainerEmails].sort()) !==
        JSON.stringify([...currentMaintainers].sort());

    // Detect variant changes
    const defaultVariantChanged =
      (params.defaultVariant && !currentDefaultVariant) ||
      (!params.defaultVariant && currentDefaultVariant) ||
      (params.defaultVariant &&
        currentDefaultVariant &&
        (JSON.stringify(params.defaultVariant.value) !==
          JSON.stringify(currentDefaultVariant.value) ||
          JSON.stringify(params.defaultVariant.schema) !==
            JSON.stringify(currentDefaultVariant.schema) ||
          JSON.stringify(params.defaultVariant.overrides) !==
            JSON.stringify(currentDefaultVariant.overrides)));

    // Find environment variants to create, update, or delete
    const variantsToCreate: typeof params.environmentVariants = [];
    const variantsToUpdate: Array<{
      variantId: string;
      environmentId: string;
      value: ConfigValue;
      schema: ConfigSchema | null;
      overrides: Override[];
      useDefaultSchema: boolean;
    }> = [];
    const variantsToDelete: string[] = [];

    for (const envVariant of params.environmentVariants) {
      const existing = currentEnvVariants.find(v => v.environmentId === envVariant.environmentId);
      if (!existing) {
        variantsToCreate.push(envVariant);
      } else {
        // Check if this variant changed
        const valueChanged = JSON.stringify(envVariant.value) !== JSON.stringify(existing.value);
        const schemaChanged = JSON.stringify(envVariant.schema) !== JSON.stringify(existing.schema);
        const overridesChanged =
          JSON.stringify(envVariant.overrides) !== JSON.stringify(existing.overrides);
        const useDefaultSchemaChanged =
          (envVariant.useDefaultSchema ?? false) !== existing.useDefaultSchema;

        if (valueChanged || schemaChanged || overridesChanged || useDefaultSchemaChanged) {
          variantsToUpdate.push({
            variantId: existing.id,
            environmentId: envVariant.environmentId,
            value: envVariant.value,
            schema: envVariant.useDefaultSchema ? null : envVariant.schema,
            overrides: envVariant.overrides,
            useDefaultSchema: envVariant.useDefaultSchema ?? false,
          });
        }
      }
    }

    // Find variants to delete (exist currently but not in new state)
    for (const existing of currentEnvVariants) {
      const stillExists = params.environmentVariants.some(
        v => v.environmentId === existing.environmentId,
      );
      if (!stillExists) {
        variantsToDelete.push(existing.id);
      }
    }

    // Check if schema/overrides changed (requires maintainer permission)
    const schemaOrOverridesChanged =
      defaultVariantChanged ||
      variantsToCreate.some(v => v.schema !== null || v.overrides.length > 0) ||
      variantsToUpdate.some(
        v =>
          v.schema !== null ||
          v.overrides.length > 0 ||
          currentEnvVariants.find(cv => cv.id === v.variantId)?.schema !== null ||
          currentEnvVariants.find(cv => cv.id === v.variantId)?.overrides.length,
      ) ||
      variantsToDelete.some(
        id =>
          currentEnvVariants.find(v => v.id === id)?.schema !== null ||
          currentEnvVariants.find(v => v.id === id)?.overrides.length,
      );

    // Validate permissions
    if (schemaOrOverridesChanged || membersChanged) {
      await this.permissionService.ensureCanManageConfig(ctx, {
        configId: existingConfig.id,
        currentUserEmail: normalizeEmail(reviewer.email),
      });
    } else if (
      descriptionChanged ||
      defaultVariantChanged ||
      variantsToCreate.length > 0 ||
      variantsToUpdate.length > 0 ||
      variantsToDelete.length > 0
    ) {
      await this.permissionService.ensureCanEditConfig(ctx, {
        configId: existingConfig.id,
        currentUserEmail: normalizeEmail(reviewer.email),
      });
    }

    // Validate override references before making changes
    if (params.defaultVariant && params.defaultVariant.overrides.length > 0) {
      validateOverrideReferences({
        overrides: params.defaultVariant.overrides,
        configProjectId: existingConfig.projectId,
      });
    }

    for (const variant of [...variantsToCreate, ...variantsToUpdate]) {
      if (variant.overrides.length > 0) {
        validateOverrideReferences({
          overrides: variant.overrides,
          configProjectId: existingConfig.projectId,
        });
      }
    }

    // Validate schema inheritance for environment variants
    for (const variant of [...variantsToCreate, ...variantsToUpdate]) {
      if (variant.useDefaultSchema) {
        if (!params.defaultVariant) {
          throw new BadRequestError(
            'Cannot use default schema when no default variant is provided',
          );
        }

        if (params.defaultVariant.schema) {
          const effectiveSchema = params.defaultVariant.schema;
          const validationResult = validateAgainstJsonSchema(variant.value, effectiveSchema as any);
          if (!validationResult.ok) {
            throw new BadRequestError(
              `Environment variant value does not match schema: ${validationResult.errors.join('; ')}`,
            );
          }
        }
      } else {
        // Validate against the variant's own schema if it has one
        if (variant.schema) {
          const validationResult = validateAgainstJsonSchema(variant.value, variant.schema as any);
          if (!validationResult.ok) {
            throw new BadRequestError(
              `Environment variant value does not match schema: ${validationResult.errors.join('; ')}`,
            );
          }
        }
      }
    }

    const nextVersion = existingConfig.version + 1;
    const now = this.dateProvider.now();

    await this.configs.update({
      ctx,
      id: existingConfig.id,
      description: params.description,
      version: nextVersion,
      updatedAt: now,
    });

    // Update members if changed
    if (membersChanged) {
      const newMembers: ConfigMember[] = [
        ...params.editorEmails.map(email => ({email, role: 'editor' as const})),
        ...params.maintainerEmails.map(email => ({email, role: 'maintainer' as const})),
      ];

      this.ensureUniqueMembers(newMembers);

      // Map current members to MemberLike format
      const currentMembersLike = currentMembers.map(m => ({
        email: m.user_email_normalized,
        role: m.role,
      }));

      const membersDiff = diffMembers(currentMembersLike, newMembers);

      // Remove old members
      for (const removed of membersDiff.removed) {
        await this.configUsers.delete(params.configId, normalizeEmail(removed.email));
      }

      // Add new members
      await this.configUsers.create(
        membersDiff.added.map(added => ({
          configId: params.configId,
          email: added.email,
          role: added.role as 'editor' | 'maintainer',
          createdAt: now,
          updatedAt: now,
        })),
      );

      // Create audit log for members change
      await this.auditLogs.create({
        id: createAuditLogId(),
        createdAt: now,
        userId: currentUser.id,
        configId: existingConfig.id,
        projectId: existingConfig.projectId,
        payload: {
          type: 'config_members_changed',
          config: {
            id: existingConfig.id,
            name: existingConfig.name,
            projectId: existingConfig.projectId,
            description: params.description,
            createdAt: existingConfig.createdAt,
            version: nextVersion,
          },
          added: membersDiff.added,
          removed: membersDiff.removed,
        },
      });
    }

    // Create/update default variant
    if (params.defaultVariant) {
      if (!currentDefaultVariant) {
        // Create new default variant
        await this.configVariants.create({
          id: createUuidV7(),
          configId: params.configId,
          environmentId: null,
          value: params.defaultVariant.value,
          schema: params.defaultVariant.schema,
          overrides: params.defaultVariant.overrides,
          createdAt: now,
          updatedAt: now,
          useDefaultSchema: false,
        });
      } else if (defaultVariantChanged) {
        // Update existing default variant
        await this.configVariants.update({
          id: currentDefaultVariant.id,
          configId: currentDefaultVariant.configId,
          value: params.defaultVariant.value,
          schema: params.defaultVariant.schema,
          overrides: params.defaultVariant.overrides,
          updatedAt: now,
          useDefaultSchema: false,
        });

        // Create version history for default variant
        await this.configVariantVersions.create({
          id: createUuidV7(),
          configVariantId: currentDefaultVariant.id,
          version: nextVersion,
          name: existingConfig.name,
          description: params.description,
          value: params.defaultVariant.value,
          schema: params.defaultVariant.schema,
          overrides: params.defaultVariant.overrides,
          authorId: currentUser.id ?? null,
          proposalId: params.originalProposalId ?? null,
          createdAt: now,
        });
      }
    } else if (currentDefaultVariant) {
      // Delete default variant
      await this.configVariants.delete({
        configId: params.configId,
        variantId: currentDefaultVariant.id,
      });
    }

    // Create new environment variants
    for (const variant of variantsToCreate) {
      const variantId = createUuidV7();
      await this.configVariants.create({
        id: variantId,
        configId: params.configId,
        environmentId: variant.environmentId,
        value: variant.value,
        schema: variant.useDefaultSchema ? null : variant.schema,
        overrides: variant.overrides,
        createdAt: now,
        updatedAt: now,
        useDefaultSchema: variant.useDefaultSchema ?? false,
      });

      // Create version history for new variant
      await this.configVariantVersions.create({
        id: createUuidV7(),
        configVariantId: variantId,
        version: nextVersion,
        name: existingConfig.name,
        description: params.description,
        value: variant.value,
        schema: variant.useDefaultSchema ? null : variant.schema,
        overrides: variant.overrides,
        authorId: currentUser.id ?? null,
        proposalId: params.originalProposalId ?? null,
        createdAt: now,
      });
    }

    // Update existing environment variants
    for (const variant of variantsToUpdate) {
      await this.configVariants.update({
        id: variant.variantId,
        configId: params.configId,
        value: variant.value,
        schema: variant.schema,
        overrides: variant.overrides,
        updatedAt: now,
        useDefaultSchema: variant.useDefaultSchema,
      });

      // Create version history for updated variant
      await this.configVariantVersions.create({
        id: createUuidV7(),
        configVariantId: variant.variantId,
        version: nextVersion,
        name: existingConfig.name,
        description: params.description,
        value: variant.value,
        schema: variant.schema,
        overrides: variant.overrides,
        authorId: currentUser.id ?? null,
        proposalId: params.originalProposalId ?? null,
        createdAt: now,
      });
    }

    // Delete environment variants
    for (const variantId of variantsToDelete) {
      await this.configVariants.delete({
        configId: params.configId,
        variantId,
      });
    }

    // Create audit log for config update
    if (descriptionChanged) {
      await this.auditLogs.create({
        id: createAuditLogId(),
        createdAt: now,
        userId: currentUser.id,
        configId: existingConfig.id,
        projectId: existingConfig.projectId,
        payload: {
          type: 'config_updated',
          before: {
            id: existingConfig.id,
            name: existingConfig.name,
            projectId: existingConfig.projectId,
            description: existingConfig.description,
            createdAt: existingConfig.createdAt,
            version: existingConfig.version,
          },
          after: {
            id: existingConfig.id,
            name: existingConfig.name,
            projectId: existingConfig.projectId,
            description: params.description,
            createdAt: existingConfig.createdAt,
            version: nextVersion,
          },
        },
      });
    }

    // Reject pending proposals
    if (params.originalProposalId) {
      // Reject all proposals EXCEPT the one with originalProposalId
      await this.rejectConfigProposalsInternal({
        configId: existingConfig.id,
        originalProposalId: params.originalProposalId,
        existingConfig,
        reviewer,
        rejectionReason: 'another_proposal_approved',
      });
    } else {
      // Reject all proposals
      await this.rejectConfigProposalsInternal({
        configId: existingConfig.id,
        originalProposalId: undefined,
        existingConfig,
        reviewer,
        rejectionReason: 'config_edited',
      });
    }
  }

  async deleteConfig(ctx: Context, params: DeleteConfigParams): Promise<void> {
    const existingConfig = await this.configs.getById(params.configId);
    if (!existingConfig) {
      throw new BadRequestError('Config does not exist');
    }

    if (existingConfig.version !== params.prevVersion) {
      throw new BadRequestError(`Config was edited by another user. Please, refresh the page.`);
    }

    // Manage permission is required to delete a config
    assert(params.reviewer.email, 'Reviewer must have an email');
    await this.permissionService.ensureCanManageConfig(ctx, {
      configId: existingConfig.id,
      currentUserEmail: normalizeEmail(params.reviewer.email),
    });

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
      await this.configVariants.delete({configId: variant.configId, variantId: variant.id});
    }

    // Delete the config metadata
    await this.configs.deleteById(ctx, existingConfig.id);

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
      const proposal = await this.configProposals.getById({
        id: params.originalProposalId,
        projectId: existingConfig.projectId,
      });

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
      const proposal = await this.configProposals.getById({
        id: proposalInfo.id,
        projectId: existingConfig.projectId,
      });
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
