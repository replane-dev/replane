import assert from 'assert';
import type {DateProvider} from '../date-provider';
import {BadRequestError} from '../errors';
import {createAuditLogId} from '../stores/audit-log-store';
import type {TransactionalUseCase} from '../use-case';
import type {NormalizedEmail} from '../zod';

export interface DeleteProjectEnvironmentRequest {
  environmentId: string;
  projectId: string;
  currentUserEmail: NormalizedEmail;
}

export interface DeleteProjectEnvironmentResponse {}

export interface DeleteProjectEnvironmentUseCaseDeps {
  dateProvider: DateProvider;
}

export function createDeleteProjectEnvironmentUseCase(
  deps: DeleteProjectEnvironmentUseCaseDeps,
): TransactionalUseCase<DeleteProjectEnvironmentRequest, DeleteProjectEnvironmentResponse> {
  return async (ctx, tx, req) => {
    const currentUser = await tx.users.getByEmail(req.currentUserEmail);
    assert(currentUser, 'Current user not found');

    const environment = await tx.projectEnvironments.getById({
      environmentId: req.environmentId,
      projectId: req.projectId,
    });
    if (!environment) {
      throw new BadRequestError('Environment not found');
    }

    // Check if user has admin permission
    await tx.permissionService.ensureCanManageProjectEnvironments(ctx, {
      projectId: environment.projectId,
      currentUserEmail: req.currentUserEmail,
    });

    // Check if this is the last environment
    const allEnvironments = await tx.projectEnvironments.getByProjectId(environment.projectId);
    if (allEnvironments.length <= 1) {
      throw new BadRequestError(
        'Cannot delete the last environment. At least one environment is required.',
      );
    }

    // Delete all config variants for this environment
    const variantsToDelete = await tx.configVariants.getByEnvironmentId(req.environmentId);

    for (const variant of variantsToDelete) {
      await tx.configVariants.delete(variant.id);
    }

    // Create audit log before deleting
    const now = deps.dateProvider.now();
    await tx.auditLogs.create({
      id: createAuditLogId(),
      createdAt: now,
      userId: currentUser.id,
      configId: null,
      projectId: environment.projectId,
      payload: {
        type: 'environment_deleted',
        environment: {
          id: environment.id,
          name: environment.name,
          projectId: environment.projectId,
        },
      },
    });

    // Delete the environment itself
    await tx.projectEnvironments.delete(req.environmentId);

    return {};
  };
}
