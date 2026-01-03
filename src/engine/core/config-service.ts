import type {Context} from './context';
import type {DateProvider} from './date-provider';
import {BadRequestError} from './errors';
import {getUserIdFromIdentity, type Identity} from './identity';
import {diffMembers} from './member-diff';
import type {Override} from './override-condition-schemas';
import type {PermissionService} from './permission-service';
import {isProposalRequired} from './proposal-requirement';
import type {ProposalService} from './proposal-service';
import {createAuditLogId, type AuditLogStore} from './stores/audit-log-store';
import type {Config, ConfigId, ConfigStore} from './stores/config-store';
import type {ConfigUserStore} from './stores/config-user-store';
import type {ConfigVariantStore} from './stores/config-variant-store';
import {
  createConfigVersionId,
  createConfigVersionMemberId,
  createConfigVersionVariantId,
  type ConfigVersionStore,
} from './stores/config-version-store';
import type {ProjectEnvironmentStore} from './stores/project-environment-store';
import type {Project} from './stores/project-store';
import type {UserStore} from './user-store';
import {normalizeEmail, parseJsonc, validateAgainstJsonSchema} from './utils';
import {createUuidV7} from './uuid';
import {validateOverrideReferences} from './validate-override-references';
import type {ConfigSchema, ConfigValue} from './zod';

export interface ApprovalRequiredResult {
  required: boolean;
  reason?: string;
  affectedEnvironmentIds?: string[];
}

export interface UpdateConfigParams {
  configId: string;
  projectId: string;
  description: string;
  editorEmails: string[];
  maintainerEmails: string[];
  defaultVariant: {value: ConfigValue; schema: ConfigSchema | null; overrides: Override[]};
  environmentVariants: Array<{
    environmentId: string;
    value: ConfigValue;
    schema: ConfigSchema | null;
    overrides: Override[];
    useBaseSchema: boolean;
  }>;
  editAuthorId: number | null;
  reviewer: Identity;
  prevVersion: number;
  originalProposalId?: string;
}

export interface DeleteConfigParams {
  configId: ConfigId;
  projectId: string;
  identity: Identity;
  originalProposalId?: string;
  prevVersion: number;
}

export class ConfigService {
  constructor(
    private readonly configs: ConfigStore,
    private readonly configUsers: ConfigUserStore,
    private readonly permissionService: PermissionService,
    private readonly auditLogs: AuditLogStore,
    private readonly dateProvider: DateProvider,
    private readonly projectEnvironments: ProjectEnvironmentStore,
    private readonly configVariants: ConfigVariantStore,
    private readonly configVersions: ConfigVersionStore,
    private readonly proposalService: ProposalService,
    private readonly users: UserStore,
  ) {}

  /**
   * Checks if approval is required for a config update.
   * Approval is required when:
   * 1. The project has requireProposals enabled AND
   * 2. Either the default value has changed OR an environment with requireProposals enabled has changes
   *
   * @param params - The parameters to check
   * @returns An object indicating whether approval is required and why
   */
  async isApprovalRequired(params: {
    project: Project;
    existingConfig: Config;
    currentVariants: Array<{
      id: string;
      environmentId: string;
      value: ConfigValue;
      schema: ConfigSchema | null;
      overrides: Override[];
    }>;
    proposedDefaultVariant: {
      value: ConfigValue;
      schema: ConfigSchema | null;
      overrides: Override[];
    };
    proposedEnvironmentVariants: Array<{
      environmentId: string;
      value: ConfigValue;
      schema: ConfigSchema | null;
      overrides: Override[];
    }>;
    currentMembers: {
      editorEmails: string[];
      maintainerEmails: string[];
    };
    proposedMembers: {
      editorEmails: string[];
      maintainerEmails: string[];
    };
  }): Promise<ApprovalRequiredResult> {
    const {
      project,
      existingConfig,
      currentVariants,
      proposedDefaultVariant,
      proposedEnvironmentVariants,
      currentMembers,
      proposedMembers,
    } = params;

    // Get all environments for the project
    const environments = await this.projectEnvironments.getByProjectId(project.id);

    // Use the pure function for the actual logic
    return isProposalRequired({
      projectRequiresProposals: project.requireProposals,
      environments: environments.map(e => ({
        id: e.id,
        requireProposals: e.requireProposals,
      })),
      current: {
        defaultVariant: {
          value: existingConfig.value,
          schema: existingConfig.schema,
          overrides: existingConfig.overrides,
        },
        environmentVariants: currentVariants.map(v => ({
          environmentId: v.environmentId,
          value: v.value,
          schema: v.schema,
          overrides: v.overrides,
        })),
        editorEmails: currentMembers.editorEmails,
        maintainerEmails: currentMembers.maintainerEmails,
      },
      proposed: {
        defaultVariant: proposedDefaultVariant,
        environmentVariants: proposedEnvironmentVariants,
        editorEmails: proposedMembers.editorEmails,
        maintainerEmails: proposedMembers.maintainerEmails,
      },
    });
  }

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
      members: Array<{email: string; role: 'editor' | 'maintainer'}>;
      projectId: string;
      description: string;
      defaultVariant: {
        value: ConfigValue;
        schema: ConfigSchema | null;
        overrides: Override[];
      };
      environmentVariants: Array<{
        environmentId: string;
        value: ConfigValue;
        schema: ConfigSchema | null;
        overrides: Override[];
        useBaseSchema: boolean;
      }>;
    },
  ): Promise<void> {
    // Validate members
    this.ensureUniqueMembers(config.members);

    const environments = await this.projectEnvironments.getByProjectId(config.projectId);

    for (const variant of config.environmentVariants) {
      const environment = environments.find(e => e.id === variant.environmentId);
      if (!environment) {
        throw new BadRequestError(`Invalid environment ID: ${variant.environmentId}`);
      }
    }

    // Validate default variant value against its schema
    if (config.defaultVariant.schema !== null && config.defaultVariant.schema !== undefined) {
      const result = validateAgainstJsonSchema(
        parseJsonc(config.defaultVariant.value),
        parseJsonc(config.defaultVariant.schema),
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

    // Validate environment variants
    for (const envVariant of config.environmentVariants) {
      // Determine which schema to use for validation
      let schemaForValidation = envVariant.useBaseSchema
        ? config.defaultVariant.schema
        : envVariant.schema;

      // Validate environment variant value against schema
      if (schemaForValidation !== null && schemaForValidation !== undefined) {
        const result = validateAgainstJsonSchema(
          parseJsonc(envVariant.value),
          parseJsonc(schemaForValidation),
        );
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
    const newMembers = [
      ...params.editorEmails.map(email => ({email, role: 'editor' as const})),
      ...params.maintainerEmails.map(email => ({email, role: 'maintainer' as const})),
    ];
    await this.validate(ctx, {
      projectId: params.projectId,
      description: params.description,
      defaultVariant: params.defaultVariant,
      environmentVariants: params.environmentVariants,
      members: newMembers,
    });

    const existingConfig = await this.configs.getById({
      id: params.configId,
      projectId: params.projectId,
    });
    if (!existingConfig) {
      throw new BadRequestError('Config does not exist');
    }

    const {reviewer, editAuthorId} = params;

    // Check version conflict
    if (existingConfig.version !== params.prevVersion) {
      throw new BadRequestError(`Config was edited by another user. Please, refresh the page.`);
    }

    // Fetch all current environment variants (default is now in configs table)
    const currentEnvVariants = await this.configVariants.getByConfigId({
      configId: params.configId,
      projectId: params.projectId,
    });

    // Determine what changed
    const descriptionChanged = params.description !== existingConfig.description;

    // Check if members changed
    const currentMembers = await this.configUsers.getByConfigId({
      configId: params.configId,
      projectId: params.projectId,
    });
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

    // Detect default variant changes (default variant is stored in configs table)
    const defaultVariantChanged =
      JSON.stringify(params.defaultVariant.value) !== JSON.stringify(existingConfig.value) ||
      JSON.stringify(params.defaultVariant.schema) !== JSON.stringify(existingConfig.schema) ||
      JSON.stringify(params.defaultVariant.overrides) !== JSON.stringify(existingConfig.overrides);

    // Find environment variants to create, update, or delete
    const variantsToCreate: typeof params.environmentVariants = [];
    const variantsToUpdate: Array<{
      variantId: string;
      environmentId: string;
      value: ConfigValue;
      schema: ConfigSchema | null;
      overrides: Override[];
      useBaseSchema: boolean;
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
        const useBaseSchemaChanged = envVariant.useBaseSchema !== existing.useBaseSchema;

        if (valueChanged || schemaChanged || overridesChanged || useBaseSchemaChanged) {
          variantsToUpdate.push({
            variantId: existing.id,
            environmentId: envVariant.environmentId,
            value: envVariant.value,
            schema: envVariant.useBaseSchema ? null : envVariant.schema,
            overrides: envVariant.overrides,
            useBaseSchema: envVariant.useBaseSchema,
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
        identity: reviewer,
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
        identity: reviewer,
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

    const nextVersion = existingConfig.version + 1;
    const now = this.dateProvider.now();

    // Update members if changed
    if (membersChanged) {
      // Map current members to MemberLike format
      const currentMembersLike = currentMembers.map(m => ({
        email: m.user_email_normalized,
        role: m.role,
      }));

      const membersDiff = diffMembers(currentMembersLike, newMembers);

      // Remove old members
      for (const removed of membersDiff.removed) {
        await this.configUsers.delete({
          configId: params.configId,
          userEmail: normalizeEmail(removed.email),
          projectId: params.projectId,
        });
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
        userId: editAuthorId,
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
            environmentVariants: currentEnvVariants.map(v => ({
              environmentId: v.environmentId,
              value: v.value,
              schema: v.schema,
              overrides: v.overrides,
            })),
            value: params.defaultVariant.value,
            schema: params.defaultVariant.schema,
            overrides: params.defaultVariant.overrides,
          },
          added: membersDiff.added,
          removed: membersDiff.removed,
        },
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
        schema: variant.useBaseSchema ? null : variant.schema,
        overrides: variant.overrides,
        createdAt: now,
        updatedAt: now,
        useBaseSchema: variant.useBaseSchema ?? false,
      });
    }

    // Update existing environment variants
    for (const variant of variantsToUpdate) {
      await this.configVariants.update({
        id: variant.variantId,
        configId: params.configId,
        projectId: params.projectId,
        value: variant.value,
        schema: variant.schema,
        overrides: variant.overrides,
        updatedAt: now,
        useBaseSchema: variant.useBaseSchema,
      });
    }

    // Delete environment variants
    for (const variantId of variantsToDelete) {
      await this.configVariants.delete({
        configId: params.configId,
        variantId,
        projectId: params.projectId,
      });
    }

    await this.configs.update({
      ctx,
      id: existingConfig.id,
      projectId: params.projectId,
      description: params.description,
      value: params.defaultVariant.value,
      schema: params.defaultVariant.schema,
      overrides: params.defaultVariant.overrides,
      version: nextVersion,
      updatedAt: now,
    });

    await this.configVersions.create({
      id: createConfigVersionId(),
      configId: params.configId,
      configName: existingConfig.name,
      version: nextVersion,
      description: params.description,
      value: params.defaultVariant.value,
      schema: params.defaultVariant.schema,
      overrides: params.defaultVariant.overrides,
      proposalId: params.originalProposalId ?? null,
      authorId: editAuthorId,
      createdAt: now,
      variants: params.environmentVariants.map(v => ({
        id: createConfigVersionVariantId(),
        environmentId: v.environmentId,
        value: v.value,
        schema: v.useBaseSchema ? null : v.schema,
        overrides: v.overrides,
        useBaseSchema: v.useBaseSchema ?? false,
      })),
      members: newMembers.map(m => ({
        id: createConfigVersionMemberId(),
        ...m,
      })),
    });

    // Create audit log for config update
    await this.auditLogs.create({
      id: createAuditLogId(),
      createdAt: now,
      userId: editAuthorId,
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
          value: existingConfig.value,
          schema: existingConfig.schema,
          overrides: existingConfig.overrides,
          environmentVariants: currentEnvVariants.map(v => ({
            environmentId: v.environmentId,
            value: v.value,
            schema: v.schema,
            overrides: v.overrides,
          })),
        },
        after: {
          id: existingConfig.id,
          name: existingConfig.name,
          projectId: existingConfig.projectId,
          description: params.description,
          createdAt: existingConfig.createdAt,
          version: nextVersion,
          value: params.defaultVariant.value,
          schema: params.defaultVariant.schema,
          overrides: params.defaultVariant.overrides,
          environmentVariants: params.environmentVariants.map(v => ({
            environmentId: v.environmentId,
            value: v.value,
            schema: v.schema,
            overrides: v.overrides,
          })),
        },
      },
    });

    // Reject pending proposals
    if (params.originalProposalId) {
      // Reject all proposals EXCEPT the one with originalProposalId
      await this.proposalService.rejectConfigProposalsInternal({
        configId: existingConfig.id,
        originalProposalId: params.originalProposalId,
        existingConfig,
        reviewer,
        rejectionReason: 'another_proposal_approved',
      });
    } else {
      // Reject all proposals
      await this.proposalService.rejectConfigProposalsInternal({
        configId: existingConfig.id,
        originalProposalId: undefined,
        existingConfig,
        reviewer,
        rejectionReason: 'config_edited',
      });
    }
  }

  async deleteConfig(ctx: Context, params: DeleteConfigParams): Promise<void> {
    const existingConfig = await this.configs.getById({
      id: params.configId,
      projectId: params.projectId,
    });
    if (!existingConfig) {
      throw new BadRequestError('Config does not exist');
    }
    await this.permissionService.ensureCanManageConfig(ctx, {
      configId: existingConfig.id,
      identity: params.identity,
    });

    if (existingConfig.version !== params.prevVersion) {
      throw new BadRequestError('Config was edited by another user. Please refresh and try again.');
    }

    const variants = await this.configVariants.getByConfigId({
      configId: existingConfig.id,
      projectId: params.projectId,
    });

    // Delete the config metadata
    await this.configs.deleteById(ctx, {
      id: existingConfig.id,
      projectId: params.projectId,
    });

    // Audit log for config deletion
    await this.auditLogs.create({
      id: createAuditLogId(),
      createdAt: this.dateProvider.now(),
      userId: getUserIdFromIdentity(params.identity),
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
          value: existingConfig.value,
          schema: existingConfig.schema,
          overrides: existingConfig.overrides,
          environmentVariants: variants.map(v => ({
            environmentId: v.environmentId,
            value: v.value,
            schema: v.schema,
            overrides: v.overrides,
          })),
        },
      },
    });
  }

  /**
   * Creates a new config with all related records (variants, version history, members, audit log).
   * This is the core method for config creation used by both regular and example config creation.
   */
  async createConfig(
    ctx: Context,
    params: {
      id: ConfigId;
      name: string;
      projectId: string;
      description: string;
      defaultVariant: {
        value: ConfigValue;
        schema: ConfigSchema | null;
        overrides: Override[];
      };
      environmentVariants: Array<{
        environmentId: string;
        value: ConfigValue;
        schema: ConfigSchema | null;
        overrides: Override[];
        useBaseSchema: boolean;
      }>;
      members: Array<{email: string; role: 'editor' | 'maintainer'}>;
      authorId: number | null;
    },
  ): Promise<{variantIds: Array<{variantId: string; environmentId: string}>}> {
    await this.validate(ctx, {
      projectId: params.projectId,
      description: params.description,
      defaultVariant: params.defaultVariant,
      environmentVariants: params.environmentVariants,
      members: params.members,
    });

    const now = this.dateProvider.now();

    // Create the config record
    await this.configs.create(ctx, {
      id: params.id,
      name: params.name,
      projectId: params.projectId,
      description: params.description,
      value: params.defaultVariant.value,
      schema: params.defaultVariant.schema,
      overrides: params.defaultVariant.overrides,
      createdAt: now,
      updatedAt: now,
      version: 1,
    });

    const variantIds: Array<{variantId: string; environmentId: string}> = [];

    // Create environment-specific variants
    for (const envVariant of params.environmentVariants) {
      const variantId = createUuidV7();
      await this.configVariants.create({
        id: variantId,
        configId: params.id,
        environmentId: envVariant.environmentId,
        value: envVariant.value,
        schema: envVariant.useBaseSchema ? null : envVariant.schema,
        overrides: envVariant.overrides,
        createdAt: now,
        updatedAt: now,
        useBaseSchema: envVariant.useBaseSchema ?? false,
      });

      variantIds.push({variantId, environmentId: envVariant.environmentId});
    }

    // Create version history
    await this.configVersions.create({
      id: createConfigVersionId(),
      configId: params.id,
      configName: params.name,
      version: 1,
      description: params.description,
      value: params.defaultVariant.value,
      schema: params.defaultVariant.schema,
      overrides: params.defaultVariant.overrides,
      proposalId: null,
      authorId: params.authorId,
      createdAt: now,
      variants: params.environmentVariants.map(v => ({
        id: createConfigVersionVariantId(),
        environmentId: v.environmentId,
        value: v.value,
        schema: v.useBaseSchema ? null : v.schema,
        overrides: v.overrides,
        useBaseSchema: v.useBaseSchema ?? false,
      })),
      members: (params.members ?? []).map(m => ({
        id: createConfigVersionMemberId(),
        ...m,
      })),
    });

    // Create config users (members) if provided
    if (params.members && params.members.length > 0) {
      await this.configUsers.create(
        params.members.map(m => ({
          email: m.email,
          role: m.role,
          configId: params.id,
          createdAt: now,
          updatedAt: now,
        })),
      );
    }

    // Create audit log
    await this.auditLogs.create({
      id: createAuditLogId(),
      createdAt: now,
      projectId: params.projectId,
      userId: params.authorId,
      configId: params.id,
      payload: {
        type: 'config_created',
        config: {
          id: params.id,
          projectId: params.projectId,
          name: params.name,
          description: params.description,
          createdAt: now,
          version: 1,
          value: params.defaultVariant.value,
          schema: params.defaultVariant.schema,
          overrides: params.defaultVariant.overrides,
          environmentVariants: params.environmentVariants.map(v => ({
            environmentId: v.environmentId,
            value: v.value,
            schema: v.schema,
            overrides: v.overrides,
          })),
        },
      },
    });

    return {variantIds};
  }
}
