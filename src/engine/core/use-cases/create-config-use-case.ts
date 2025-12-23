import type {DateProvider} from '../date-provider';
import {BadRequestError} from '../errors';
import {getAuditIdentityInfo, type Identity} from '../identity';
import type {Override} from '../override-condition-schemas';
import {createConfigId, type ConfigId} from '../stores/config-store';
import type {TransactionalUseCase} from '../use-case';
import {validateAgainstJsonSchema} from '../utils';
import {validateOverrideReferences} from '../validate-override-references';
import type {ConfigSchema, ConfigValue} from '../zod';

export interface CreateConfigRequest {
  name: string;
  description: string;
  identity: Identity;
  editorEmails: string[];
  maintainerEmails: string[];
  projectId: string;
  defaultVariant: {
    value: ConfigValue;
    schema: ConfigSchema | null;
    overrides: Override[];
  };
  environmentVariants?: Array<{
    environmentId: string;
    value: ConfigValue;
    schema: ConfigSchema | null;
    overrides: Override[];
    useBaseSchema: boolean;
  }>;
}

export interface CreateConfigResponse {
  configId: ConfigId;
  configVariantIds: Array<{variantId: string; environmentId: string}>;
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
      identity: req.identity,
    });

    const auditInfo = getAuditIdentityInfo(req.identity);

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
      if (envVariant.useBaseSchema) {
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

    // Get user ID for audit log (null for API key)
    let authorId: number | null = null;
    if (auditInfo.userEmail) {
      const currentUser = await tx.users.getByEmail(auditInfo.userEmail);
      if (!currentUser) {
        throw new BadRequestError('User not found');
      }
      authorId = currentUser.id;
    }

    const configId = createConfigId();

    // Use the config service to create the config with all related records
    const {variantIds} = await tx.configService.createConfig(ctx, {
      id: configId,
      name: req.name,
      projectId: req.projectId,
      description: req.description,
      defaultVariant: req.defaultVariant,
      environmentVariants,
      members: allMembers,
      authorId,
    });

    return {
      configId,
      configVariantIds: variantIds,
    };
  };
}
