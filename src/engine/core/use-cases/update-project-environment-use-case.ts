import assert from 'assert';
import type {DateProvider} from '../date-provider';
import {BadRequestError} from '../errors';
import {requireUserEmail, type Identity} from '../identity';
import type {TransactionalUseCase} from '../use-case';

export interface UpdateProjectEnvironmentRequest {
  environmentId: string;
  projectId: string;
  name: string;
  requireProposals: boolean;
  identity: Identity;
}

export interface UpdateProjectEnvironmentResponse {}

export interface UpdateProjectEnvironmentUseCaseDeps {
  dateProvider: DateProvider;
}

export function createUpdateProjectEnvironmentUseCase(
  deps: UpdateProjectEnvironmentUseCaseDeps,
): TransactionalUseCase<UpdateProjectEnvironmentRequest, UpdateProjectEnvironmentResponse> {
  return async (ctx, tx, req) => {
    // This operation requires a user identity
    const currentUserEmail = requireUserEmail(req.identity);

    await tx.permissionService.ensureIsWorkspaceMember(ctx, {
      projectId: req.projectId,
      identity: req.identity,
    });

    const currentUser = await tx.users.getByEmail(currentUserEmail);
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
      identity: req.identity,
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
      projectId: req.projectId,
      name: req.name,
      requireProposals: req.requireProposals,
      updatedAt: deps.dateProvider.now(),
    });

    return {};
  };
}
