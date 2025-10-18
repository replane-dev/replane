import assert from 'assert';
import type {ConfigId} from '../config-store';
import type {DateProvider} from '../date-provider';
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
}

export function createPatchConfigUseCase(
  deps: PatchConfigUseCaseDeps,
): TransactionalUseCase<PatchConfigRequest, PatchConfigResponse> {
  return async (ctx, tx, req) => {
    const currentUser = await tx.users.getByEmail(req.currentUserEmail);
    assert(currentUser, 'Current user not found');

    await tx.configService.patchConfig({
      ...req,
      patchAuthor: currentUser,
      reviewer: currentUser,
    });

    return {};
  };
}
