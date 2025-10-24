import assert from 'assert';
import type {ConfigId} from '../config-store';
import type {DateProvider} from '../date-provider';
import {BadRequestError} from '../errors';
import type {TransactionalUseCase} from '../use-case';
import type {ConfigMember, NormalizedEmail} from '../zod';

export interface PatchConfigRequest {
  configId: ConfigId;
  value?: {newValue: any};
  schema?: {newSchema: any};
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

    // When requireProposals is enabled, forbid direct content changes
    // (value/schema/description) and require going through proposals instead.
    // Membership updates (members) are still allowed directly.
    const hasContentChange = Boolean(req.value || req.schema || req.description);
    if (deps.requireProposals && hasContentChange) {
      throw new BadRequestError(
        'Direct config changes are disabled. Please create a proposal instead.',
      );
    }

    await tx.configService.patchConfig({
      ...req,
      patchAuthor: currentUser,
      reviewer: currentUser,
    });

    return {};
  };
}
