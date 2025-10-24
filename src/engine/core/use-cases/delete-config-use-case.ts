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

export interface DeleteConfigUseCaseDeps {
  requireProposals: boolean;
}

export function createDeleteConfigUseCase(
  deps: DeleteConfigUseCaseDeps,
): TransactionalUseCase<DeleteConfigRequest, DeleteConfigResponse> {
  return async (ctx, tx, req) => {
    // When requireProposals is enabled, forbid direct deletions.
    // Users should use the proposal workflow instead of deleting configs outright.
    if (deps.requireProposals) {
      throw new BadRequestError(
        'Direct config deletion is disabled. Please use the proposal workflow instead.',
      );
    }

    const currentUser = await tx.users.getByEmail(req.currentUserEmail);
    assert(currentUser, 'Current user not found');

    await tx.configService.deleteConfig({
      configId: req.configId,
      reviewer: currentUser,
      deleteAuthor: currentUser,
      prevVersion: req.prevVersion,
    });

    return {};
  };
}
