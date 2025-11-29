import assert from 'assert';
import type {ConfigId} from '../config-store';
import {BadRequestError} from '../errors';
import type {TransactionalUseCase} from '../use-case';
import type {NormalizedEmail} from '../zod';

export interface DeleteConfigRequest {
  configId: ConfigId;
  currentUserEmail: NormalizedEmail;
  prevVersion: number;
}

export interface DeleteConfigResponse {}

export interface DeleteConfigUseCaseDeps {}

export function createDeleteConfigUseCase(
  deps: DeleteConfigUseCaseDeps,
): TransactionalUseCase<DeleteConfigRequest, DeleteConfigResponse> {
  return async (ctx, tx, req) => {
    const currentUser = await tx.users.getByEmail(req.currentUserEmail);
    assert(currentUser, 'Current user not found');

    // Get the config to find the project
    const config = await tx.configs.getById(req.configId);
    if (!config) {
      throw new BadRequestError('Config not found');
    }

    const project = await tx.projects.getById({
      id: config.projectId,
      currentUserEmail: req.currentUserEmail,
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

    await tx.configService.deleteConfig({
      configId: req.configId,
      reviewer: currentUser,
      deleteAuthor: currentUser,
      prevVersion: req.prevVersion,
    });

    return {};
  };
}
