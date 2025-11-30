import assert from 'assert';
import type {DateProvider} from '../date-provider';
import {BadRequestError} from '../errors';
import type {TransactionalUseCase} from '../use-case';
import type {NormalizedEmail} from '../zod';

export interface UpdateProjectEnvironmentRequest {
  environmentId: string;
  projectId: string;
  name: string;
  currentUserEmail: NormalizedEmail;
}

export interface UpdateProjectEnvironmentResponse {}

export interface UpdateProjectEnvironmentUseCaseDeps {
  dateProvider: DateProvider;
}

export function createUpdateProjectEnvironmentUseCase(
  deps: UpdateProjectEnvironmentUseCaseDeps,
): TransactionalUseCase<UpdateProjectEnvironmentRequest, UpdateProjectEnvironmentResponse> {
  return async (ctx, tx, req) => {
    await tx.permissionService.ensureIsOrganizationMember(ctx, {
      projectId: req.projectId,
      currentUserEmail: req.currentUserEmail,
    });

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
      projectId: req.projectId,
      currentUserEmail: req.currentUserEmail,
    });

    // Validate environment name
    if (!/^[A-Za-z0-9_\s-]{1,50}$/i.test(req.name)) {
      throw new BadRequestError(
        'Environment name must be 1-50 characters and contain only letters, numbers, spaces, underscores, or hyphens',
      );
    }

    // Check if another environment with this name already exists
    const existing = await tx.projectEnvironments.getByProjectIdAndName({
      projectId: environment.projectId,
      name: req.name,
    });

    if (existing && existing.id !== req.environmentId) {
      throw new BadRequestError('Environment with this name already exists in this project');
    }

    await tx.projectEnvironments.update({
      id: req.environmentId,
      name: req.name,
      updatedAt: deps.dateProvider.now(),
    });

    return {};
  };
}
