import assert from 'assert';
import type {DateProvider} from '../date-provider';
import {BadRequestError} from '../errors';
import type {Override} from '../override-condition-schemas';
import {createAuditLogId} from '../stores/audit-log-store';
import {createConfigId, type ConfigId} from '../stores/config-store';
import type {NewConfigUser} from '../stores/config-user-store';
import type {TransactionalUseCase} from '../use-case';
import {validateAgainstJsonSchema} from '../utils';
import {createUuidV7} from '../uuid';
import {validateOverrideReferences} from '../validate-override-references';
import type {NormalizedEmail} from '../zod';

export interface CreateConfigRequest {
  name: string;
  description: string;
  currentUserEmail: NormalizedEmail;
  editorEmails: string[];
  maintainerEmails: string[];
  projectId: string;
  // New flexible variant structure
  defaultVariant?: {
    value: any;
    schema: unknown;
    overrides: Override[];
  };
  environmentVariants?: Array<{
    environmentId: string;
    value: any;
    schema: unknown;
    overrides: Override[];
    useDefaultSchema?: boolean; // If true, inherit schema from default variant
  }>;
}

export interface CreateConfigResponse {
  configId: ConfigId;
  configVariantIds: Array<{variantId: string; environmentId: string | null}>;
}

export interface CreateConfigUseCaseDeps {
  dateProvider: DateProvider;
}

export function createCreateConfigUseCase(
  deps: CreateConfigUseCaseDeps,
): TransactionalUseCase<CreateConfigRequest, CreateConfigResponse> {
  return async (ctx, tx, req) => {
    await tx.permissionService.ensureCanCreateConfig(ctx, {
      projectId: req.projectId,
      currentUserEmail: req.currentUserEmail,
    });

    // Validate no user appears with multiple roles
    const allMembers = [
      ...req.editorEmails.map(email => ({email, role: 'editor' as const})),
      ...req.maintainerEmails.map(email => ({email, role: 'maintainer' as const})),
    ];
    tx.configService.ensureUniqueMembers(allMembers);

    const existingConfig = await tx.configs.getByName({
      name: req.name,
      projectId: req.projectId,
    });
    if (existingConfig) {
      throw new BadRequestError('Config with this name already exists');
    }

    // Get all environments for this project
    const environments = await tx.projectEnvironments.getByProjectId(req.projectId);
    if (environments.length === 0) {
      throw new BadRequestError('Project has no environments. Create an environment first.');
    }

    // Validate variant structure
    if (!req.defaultVariant && !req.environmentVariants) {
      throw new BadRequestError('Must provide either defaultVariant or environmentVariants');
    }

    const environmentVariants = req.environmentVariants ?? [];
    const envVariantIds = new Set(environmentVariants.map(v => v.environmentId));
    const allEnvironmentIds = new Set(environments.map(e => e.id));
    const missingEnvironments = environments.filter(e => !envVariantIds.has(e.id));

    // Validation: if any environment is missing, default variant is required
    if (missingEnvironments.length > 0 && !req.defaultVariant) {
      throw new BadRequestError(
        `Default variant is required when environment-specific variants are not provided for all environments. Missing: ${missingEnvironments.map(e => e.name).join(', ')}`,
      );
    }

    // Validate default variant if provided
    if (req.defaultVariant) {
      if (req.defaultVariant.schema !== null && req.defaultVariant.schema !== undefined) {
        const result = validateAgainstJsonSchema(
          req.defaultVariant.value,
          req.defaultVariant.schema as any,
        );
        if (!result.ok) {
          throw new BadRequestError(
            `Default variant value does not match schema: ${result.errors.join('; ')}`,
          );
        }
      }
      validateOverrideReferences({
        overrides: req.defaultVariant.overrides,
        configProjectId: req.projectId,
      });
    }

    // Validate environment variants
    for (const envVariant of environmentVariants) {
      if (!allEnvironmentIds.has(envVariant.environmentId)) {
        throw new BadRequestError(`Invalid environment ID: ${envVariant.environmentId}`);
      }

      // Determine which schema to use for validation
      let schemaToValidate: unknown = null;
      if (envVariant.useDefaultSchema) {
        // Use default schema for validation
        if (!req.defaultVariant) {
          throw new BadRequestError(
            'Cannot use default schema when no default variant is provided',
          );
        }
        schemaToValidate = req.defaultVariant.schema;
      } else if (envVariant.schema !== null && envVariant.schema !== undefined) {
        schemaToValidate = envVariant.schema;
      }

      if (schemaToValidate !== null && schemaToValidate !== undefined) {
        const result = validateAgainstJsonSchema(envVariant.value, schemaToValidate as any);
        if (!result.ok) {
          throw new BadRequestError(
            `Environment variant value does not match schema: ${result.errors.join('; ')}`,
          );
        }
      }
      validateOverrideReferences({
        overrides: envVariant.overrides,
        configProjectId: req.projectId,
      });
    }

    const currentUser = await tx.users.getByEmail(req.currentUserEmail);
    assert(currentUser, 'Current user not found');

    const configId = createConfigId();
    const now = deps.dateProvider.now();

    // Create config (metadata only)
    await tx.configs.create({
      id: configId,
      name: req.name,
      projectId: req.projectId,
      description: req.description,
      createdAt: now,
      updatedAt: now,
      creatorId: currentUser.id,
      version: 1,
    });

    const configVariantIds: Array<{variantId: string; environmentId: string | null}> = [];

    // Create default variant if provided
    if (req.defaultVariant) {
      const variantId = createUuidV7();
      await tx.configVariants.create({
        id: variantId,
        configId,
        environmentId: null,
        value: req.defaultVariant.value,
        schema: req.defaultVariant.schema,
        overrides: req.defaultVariant.overrides,
        createdAt: now,
        updatedAt: now,
        useDefaultSchema: false, // Default variant doesn't inherit from itself
      });

      configVariantIds.push({variantId, environmentId: null});

      // Create version history for default variant
      await tx.configVariantVersions.create({
        id: createUuidV7(),
        configVariantId: variantId,
        version: 1,
        name: req.name,
        description: req.description,
        value: req.defaultVariant.value,
        schema: req.defaultVariant.schema,
        overrides: req.defaultVariant.overrides,
        authorId: currentUser.id,
        proposalId: null,
        createdAt: now,
      });
    }

    // Create environment-specific variants
    for (const envVariant of environmentVariants) {
      const variantId = createUuidV7();
      await tx.configVariants.create({
        id: variantId,
        configId,
        environmentId: envVariant.environmentId,
        value: envVariant.value,
        schema: envVariant.useDefaultSchema ? null : envVariant.schema, // null when using default schema
        overrides: envVariant.overrides,
        createdAt: now,
        updatedAt: now,
        useDefaultSchema: envVariant.useDefaultSchema ?? false,
      });

      configVariantIds.push({variantId, environmentId: envVariant.environmentId});

      // Create version history for this variant
      await tx.configVariantVersions.create({
        id: createUuidV7(),
        configVariantId: variantId,
        version: 1,
        name: req.name,
        description: req.description,
        value: envVariant.value,
        schema: envVariant.schema,
        overrides: envVariant.overrides,
        authorId: currentUser.id,
        proposalId: null,
        createdAt: now,
      });
    }

    await tx.configUsers.create(
      req.editorEmails
        .map(
          (email): NewConfigUser => ({
            email,
            role: 'editor',
            configId,
            createdAt: now,
            updatedAt: now,
          }),
        )
        .concat(
          req.maintainerEmails.map(
            (email): NewConfigUser => ({
              email,
              role: 'maintainer',
              configId,
              createdAt: now,
              updatedAt: now,
            }),
          ),
        ),
    );

    const fullConfig = await tx.configs.getById(configId);
    assert(fullConfig, 'Just created config not found');

    // One audit log for config creation
    await tx.auditLogs.create({
      id: createAuditLogId(),
      createdAt: now,
      projectId: fullConfig.projectId,
      userId: currentUser.id,
      configId: fullConfig.id,
      payload: {
        type: 'config_created',
        config: {
          id: fullConfig.id,
          projectId: fullConfig.projectId,
          name: fullConfig.name,
          description: fullConfig.description,
          creatorId: fullConfig.creatorId,
          createdAt: fullConfig.createdAt,
          version: fullConfig.version,
        },
      },
    });

    return {
      configId,
      configVariantIds,
    };
  };
}
