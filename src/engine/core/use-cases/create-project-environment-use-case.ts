import assert from 'assert';
import type {DateProvider} from '../date-provider';
import {BadRequestError} from '../errors';
import type {TransactionalUseCase} from '../use-case';
import {createUuidV7} from '../uuid';
import type {NormalizedEmail} from '../zod';

export interface CreateProjectEnvironmentRequest {
  projectId: string;
  name: string;
  copyFromEnvironmentId?: string;
  currentUserEmail: NormalizedEmail;
}

export interface CreateProjectEnvironmentResponse {
  environmentId: string;
}

export interface CreateProjectEnvironmentUseCaseDeps {
  dateProvider: DateProvider;
}

export function createCreateProjectEnvironmentUseCase(
  deps: CreateProjectEnvironmentUseCaseDeps,
): TransactionalUseCase<CreateProjectEnvironmentRequest, CreateProjectEnvironmentResponse> {
  return async (ctx, tx, req) => {
    const currentUser = await tx.users.getByEmail(req.currentUserEmail);
    assert(currentUser, 'Current user not found');

    // Check if user has admin permission
    await tx.permissionService.ensureCanManageProjectUsers(req.projectId, req.currentUserEmail);

    // Validate environment name
    if (!/^[A-Za-z0-9_\s-]{1,50}$/i.test(req.name)) {
      throw new BadRequestError(
        'Environment name must be 1-50 characters and contain only letters, numbers, spaces, underscores, or hyphens',
      );
    }

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

    await tx.projectEnvironments.create({
      id: environmentId,
      projectId: req.projectId,
      name: req.name,
      order: maxOrder + 1,
      createdAt: now,
      updatedAt: now,
    });

    // Create config variants for all existing configs in this project
    const configs = await tx.configs.getAll({
      projectId: req.projectId,
      currentUserEmail: req.currentUserEmail,
    });

    for (const config of configs) {
      const configVariantId = createUuidV7();

      // Get the variant to copy from
      const existingVariants = await tx.configVariants.getByConfigId(config.id);
      let templateVariant = existingVariants[0];

      // If a specific environment was requested to copy from, use that
      if (req.copyFromEnvironmentId) {
        const specificVariant = existingVariants.find(
          v => v.environmentId === req.copyFromEnvironmentId,
        );
        if (specificVariant) {
          templateVariant = specificVariant;
        }
      }

      if (templateVariant) {
        await tx.configVariants.create({
          id: configVariantId,
          configId: config.id,
          environmentId,
          value: templateVariant.value,
          schema: templateVariant.schema,
          overrides: templateVariant.overrides,
          version: 1,
          createdAt: now,
          updatedAt: now,
        });
      }
    }

    return {environmentId};
  };
}
