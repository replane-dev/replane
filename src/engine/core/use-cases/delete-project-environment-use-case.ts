import assert from 'assert';
import {BadRequestError} from '../errors';
import type {TransactionalUseCase} from '../use-case';
import type {NormalizedEmail} from '../zod';

export interface DeleteProjectEnvironmentRequest {
  environmentId: string;
  currentUserEmail: NormalizedEmail;
}

export interface DeleteProjectEnvironmentResponse {}

export function createDeleteProjectEnvironmentUseCase(): TransactionalUseCase<
  DeleteProjectEnvironmentRequest,
  DeleteProjectEnvironmentResponse
> {
  return async (ctx, tx, req) => {
    const currentUser = await tx.users.getByEmail(req.currentUserEmail);
    assert(currentUser, 'Current user not found');

    const environment = await tx.projectEnvironments.getById(req.environmentId);
    if (!environment) {
      throw new BadRequestError('Environment not found');
    }

    // Check if user has admin permission
    await tx.permissionService.ensureCanManageProjectUsers(
      environment.projectId,
      req.currentUserEmail,
    );

    // Check if this is the last environment
    const allEnvironments = await tx.projectEnvironments.getByProjectId(environment.projectId);
    if (allEnvironments.length <= 1) {
      throw new BadRequestError(
        'Cannot delete the last environment. At least one environment is required.',
      );
    }

    // Delete all config variants for this environment
    const configs = await tx.configs.getAll({
      projectId: environment.projectId,
      currentUserEmail: req.currentUserEmail,
    });

    for (const config of configs) {
      const variants = await tx.configVariants.getByConfigId(config.id);
      const variantToDelete = variants.find(v => v.environmentId === req.environmentId);

      if (variantToDelete) {
        await tx.configVariants.delete(variantToDelete.id);
      }
    }

    // Delete the environment itself
    await tx.projectEnvironments.delete(req.environmentId);

    return {};
  };
}
