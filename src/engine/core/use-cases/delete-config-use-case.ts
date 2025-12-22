import assert from 'assert';
import {BadRequestError} from '../errors';
import {requireUserEmail, type Identity} from '../identity';
import type {ConfigId} from '../stores/config-store';
import type {TransactionalUseCase} from '../use-case';

export interface DeleteConfigRequest {
  configId: ConfigId;
  identity: Identity;
  prevVersion: number;
}

export interface DeleteConfigResponse {}

export interface DeleteConfigUseCaseDeps {}

export function createDeleteConfigUseCase(
  deps: DeleteConfigUseCaseDeps,
): TransactionalUseCase<DeleteConfigRequest, DeleteConfigResponse> {
  return async (ctx, tx, req) => {
    await tx.permissionService.ensureCanManageConfig(ctx, {
      configId: req.configId,
      identity: req.identity,
    });

    // Deleting configs requires a user identity to track authorship
    const currentUserEmail = requireUserEmail(req.identity);

    const currentUser = await tx.users.getByEmail(currentUserEmail);
    assert(currentUser, 'Current user not found');

    // Get the config to find the project
    const config = await tx.configs.getById(req.configId);
    if (!config) {
      throw new BadRequestError('Config not found');
    }

    const project = await tx.projects.getById({
      id: config.projectId,
      currentUserEmail,
    });
    if (!project) {
      throw new BadRequestError('Project not found');
    }

    // When requireProposals is enabled, forbid direct deletions.
    // Users should use the proposal workflow instead of deleting configs outright.
    if (project.requireProposals) {
      throw new BadRequestError(
        'Direct config deletion is disabled. Please use the proposal workflow instead.',
      );
    }

    await tx.configService.deleteConfig(ctx, {
      configId: req.configId,
      reviewer: currentUser,
      deleteAuthor: currentUser,
      prevVersion: req.prevVersion,
    });

    return {};
  };
}
