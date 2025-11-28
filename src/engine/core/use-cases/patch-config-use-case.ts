import assert from 'assert';
import type {ConfigId} from '../config-store';
import type {DateProvider} from '../date-provider';
import {BadRequestError} from '../errors';
import type {Override} from '../override-evaluator';
import type {TransactionalUseCase} from '../use-case';
import type {ConfigMember, NormalizedEmail} from '../zod';

export interface PatchConfigVariantChange {
  configVariantId: string;
  prevVersion: number;
  value?: {newValue: any};
  schema?: {newSchema: any};
  overrides?: {newOverrides: Override[]};
}

export interface PatchConfigRequest {
  configId: ConfigId;
  description?: {newDescription: string};
  currentUserEmail: NormalizedEmail;
  members?: {newMembers: ConfigMember[]};
  prevVersion: number;
  variants?: PatchConfigVariantChange[];
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

    // Patch variants first (if any)
    if (req.variants && req.variants.length > 0) {
      for (const variantChange of req.variants) {
        await tx.configService.patchConfigVariant({
          configVariantId: variantChange.configVariantId,
          value: variantChange.value,
          schema: variantChange.schema,
          overrides: variantChange.overrides,
          patchAuthor: currentUser,
          reviewer: currentUser,
          prevVersion: variantChange.prevVersion,
        });
      }
    }

    // Patch config-level fields (description, members) if any changed
    if (req.description || req.members) {
      await tx.configService.patchConfig({
        configId: req.configId,
        description: req.description,
        members: req.members,
        patchAuthor: currentUser,
        reviewer: currentUser,
        prevVersion: req.prevVersion,
      });
    }

    return {};
  };
}
