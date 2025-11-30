import assert from 'assert';
import {createAuditLogId} from '../audit-log-store';
import {createConfigId, type ConfigId} from '../config-store';
import type {NewConfigUser} from '../config-user-store';
import type {DateProvider} from '../date-provider';
import {BadRequestError} from '../errors';
import type {Override} from '../override-condition-schemas';
import type {TransactionalUseCase} from '../use-case';
import {validateAgainstJsonSchema} from '../utils';
import {createUuidV7} from '../uuid';
import {validateOverrideReferences} from '../validate-override-references';
import type {NormalizedEmail} from '../zod';

export interface CreateConfigRequest {
  name: string;
  value: any;
  description: string;
  schema: unknown;
  overrides: Override[];
  currentUserEmail: NormalizedEmail;
  editorEmails: string[];
  maintainerEmails: string[];
  projectId: string;
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
      currentUserEmail: req.currentUserEmail,
    });

    // Validate no user appears with multiple roles
    // Map API names (ownerEmails/editorEmails) to database roles (maintainer/editor)
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

    if (req.schema !== null) {
      const result = validateAgainstJsonSchema(req.value, req.schema as any);
      if (!result.ok) {
        throw new BadRequestError(
          `Config value does not match schema: ${result.errors.join('; ')}`,
        );
      }
    }

    // Validate override references use the same project ID
    validateOverrideReferences({
      overrides: req.overrides as Override[] | null,
      configProjectId: req.projectId,
    });

    const currentUser = await tx.users.getByEmail(req.currentUserEmail);
    assert(currentUser, 'Current user not found');

    const configId = createConfigId();

    // Create config (metadata only)
    const now = deps.dateProvider.now();

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

    // Get all environments for this project
    const environments = await tx.projectEnvironments.getByProjectId(req.projectId);

    if (environments.length === 0) {
      throw new BadRequestError('Project has no environments. Create an environment first.');
    }

    // Create a variant for each environment with the same initial value
    const configVariantIds: Array<{variantId: string; environmentId: string}> = [];
    for (const environment of environments) {
      const variantId = createUuidV7();

      await tx.configVariants.create({
        id: variantId,
        configId,
        environmentId: environment.id,
        value: req.value,
        schema: req.schema,
        overrides: req.overrides,
        version: 1,
        createdAt: now,
        updatedAt: now,
      });

      configVariantIds.push({variantId, environmentId: environment.id});

      // Create version history for this variant
      await tx.configVariantVersions.create({
        id: createUuidV7(),
        configVariantId: variantId,
        version: 1,
        name: req.name,
        description: req.description,
        value: req.value,
        schema: req.schema,
        overrides: req.overrides,
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
              role: 'maintainer', // owners map to maintainer role in database
              configId,
              createdAt: now,
              updatedAt: now,
            }),
          ),
        ),
    );

    const fullConfig = await tx.configs.getById(configId);

    assert(fullConfig, 'Just created config not found');

    // One audit log for config creation (not per environment)
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
