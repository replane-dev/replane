import assert from 'assert';
import {createAuditLogId} from '../audit-log-store';
import type {DateProvider} from '../date-provider';
import {BadRequestError} from '../errors';
import type {TransactionalUseCase} from '../use-case';
import {createUuidV7} from '../uuid';
import type {NormalizedEmail} from '../zod';

export interface CreateEnvironmentRequest {
  projectId: string;
  name: string;
  currentUserEmail: NormalizedEmail;
}

export interface CreateEnvironmentResponse {
  environmentId: string;
}

export interface CreateEnvironmentUseCaseDeps {
  dateProvider: DateProvider;
}

export function createCreateEnvironmentUseCase(
  deps: CreateEnvironmentUseCaseDeps,
): TransactionalUseCase<CreateEnvironmentRequest, CreateEnvironmentResponse> {
  return async (ctx, tx, req) => {
    await tx.permissionService.ensureCanManageProject(req.projectId, req.currentUserEmail);

    const currentUser = await tx.users.getByEmail(req.currentUserEmail);
    assert(currentUser, 'Current user not found');

    // Check if environment with this name already exists
    const existing = await tx.projectEnvironments.getByProjectIdAndName({
      projectId: req.projectId,
      name: req.name,
    });

    if (existing) {
      throw new BadRequestError('Environment with this name already exists in this project');
    }

    const environmentId = createUuidV7();
    const now = deps.dateProvider.now();

    // Get the current max order for this project to append at the end
    const existingEnvironments = await tx.projectEnvironments.getByProjectId(req.projectId);
    const maxOrder = Math.max(0, ...existingEnvironments.map(e => e.order));

    // Create the environment
    await tx.projectEnvironments.create({
      id: environmentId,
      projectId: req.projectId,
      name: req.name,
      order: maxOrder + 1,
      createdAt: now,
      updatedAt: now,
    });

    // Get all configs for this project by finding their variants
    // Since there's no direct getByProjectId, we need to find an existing environment first
    const projectEnvs = await tx.projectEnvironments.getByProjectId(req.projectId);
    if (projectEnvs.length === 0) {
      // No environments exist yet, no configs to copy
      return {environmentId};
    }

    // Get all variants from the first environment to find all configs
    const allVariants = await tx.configVariants.getByEnvironmentId(projectEnvs[0].id);
    const configIds = Array.from(new Set(allVariants.map(v => v.configId)));

    const configs = [];
    for (const configId of configIds) {
      const config = await tx.configs.getById(configId);
      if (config && config.projectId === req.projectId) {
        configs.push(config);
      }
    }

    // For each config, create a variant in the new environment
    // Copy value/schema/overrides from an existing variant (prefer Production)
    for (const config of configs) {
      const existingVariants = await tx.configVariants.getByConfigId(config.id);

      // Find Production variant first, or fall back to first variant
      const sourceVariant =
        existingVariants.find(v => v.environmentName === 'Production') ?? existingVariants[0];

      if (!sourceVariant) {
        // This shouldn't happen, but handle gracefully
        continue;
      }

      const variantId = createUuidV7();

      // Create variant with same value/schema/overrides as source
      await tx.configVariants.create({
        id: variantId,
        configId: config.id,
        environmentId,
        value: sourceVariant.value,
        schema: sourceVariant.schema,
        overrides: sourceVariant.overrides,
        version: 1,
        createdAt: now,
        updatedAt: now,
      });

      // Create version history for this variant
      await tx.configVariantVersions.create({
        id: createUuidV7(),
        configVariantId: variantId,
        version: 1,
        name: config.name,
        description: config.description,
        value: sourceVariant.value,
        schema: sourceVariant.schema,
        overrides: sourceVariant.overrides,
        authorId: currentUser.id,
        proposalId: null,
        createdAt: now,
      });
    }

    // Create audit log for environment creation
    await tx.auditLogs.create({
      id: createAuditLogId(),
      createdAt: now,
      userId: currentUser.id,
      configId: null,
      projectId: req.projectId,
      payload: {
        type: 'environment_created',
        environment: {
          id: environmentId,
          name: req.name,
          projectId: req.projectId,
          createdAt: now,
        },
      },
    });

    return {
      environmentId,
    };
  };
}
