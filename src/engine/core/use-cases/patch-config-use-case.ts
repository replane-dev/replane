import assert from 'assert';
import type {ConfigId} from '../config-store';
import type {DateProvider} from '../date-provider';
import {BadRequestError} from '../errors';
import type {TransactionalUseCase} from '../use-case';
import type {ConfigMember, NormalizedEmail} from '../zod';

export interface PatchConfigRequest {
  configId: ConfigId;
  description?: {newDescription: string};
  currentUserEmail: NormalizedEmail;
  members?: {newMembers: ConfigMember[]};
  prevVersion: number;
}

export interface PatchConfigResponse {}

export interface PatchConfigUseCaseDeps {
  dateProvider: DateProvider;
  requireProposals: boolean;
}

export function createPatchConfigUseCase(
  deps: PatchConfigUseCaseDeps,
): TransactionalUseCase<PatchConfigRequest, PatchConfigResponse> {
  return async (ctx, tx, req) => {
    const currentUser = await tx.users.getByEmail(req.currentUserEmail);
    assert(currentUser, 'Current user not found');

    if (deps.requireProposals) {
      throw new BadRequestError(
        'Direct config changes are disabled. Please create a proposal instead.',
      );
    }

    await tx.configService.patchConfig({
      configId: req.configId,
      description: req.description,
      members: req.members,
      patchAuthor: currentUser,
      reviewer: currentUser,
      prevVersion: req.prevVersion,
    });

    return {};
  };
}
