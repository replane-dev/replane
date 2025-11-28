import assert from 'assert';
import {createAuditLogId} from '../audit-log-store';
import type {DateProvider} from '../date-provider';
import {BadRequestError} from '../errors';
import type {TransactionalUseCase} from '../use-case';
import type {NormalizedEmail} from '../zod';

export interface DeleteEnvironmentRequest {
  environmentId: string;
  currentUserEmail: NormalizedEmail;
}

export interface DeleteEnvironmentResponse {}

export interface DeleteEnvironmentUseCaseDeps {
  dateProvider: DateProvider;
}

export function createDeleteEnvironmentUseCase(
  deps: DeleteEnvironmentUseCaseDeps,
): TransactionalUseCase<DeleteEnvironmentRequest, DeleteEnvironmentResponse> {
  return async (ctx, tx, req) => {
    const environment = await tx.projectEnvironments.getById(req.environmentId);

    if (!environment) {
      throw new BadRequestError('Environment not found');
    }

    await tx.permissionService.ensureCanManageProject(
      environment.projectId,
      req.currentUserEmail,
    );

    const currentUser = await tx.users.getByEmail(req.currentUserEmail);
    assert(currentUser, 'Current user not found');

    // Check if this is the last environment
    const allEnvironments = await tx.projectEnvironments.getByProjectId(environment.projectId);

    if (allEnvironments.length === 1) {
      throw new BadRequestError(
        'Cannot delete the last environment. Projects must have at least one environment.',
      );
    }

    // Delete the environment (variants will be cascade deleted due to FK constraint)
    await tx.projectEnvironments.delete(req.environmentId);

    // Create audit log for environment deletion
    await tx.auditLogs.create({
      id: createAuditLogId(),
      createdAt: deps.dateProvider.now(),
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

    return {};
  };
}
