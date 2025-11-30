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
}

export function createPatchConfigUseCase(
  deps: PatchConfigUseCaseDeps,
): TransactionalUseCase<PatchConfigRequest, PatchConfigResponse> {
  return async (ctx, tx, req) => {
    const currentUser = await tx.users.getByEmail(req.currentUserEmail);
    assert(currentUser, 'Current user not found');

    // Get the config to check its project's requireProposals setting
    const config = await tx.configs.getById(req.configId);
    if (!config) {
      throw new BadRequestError('Config not found');
    }

    // Get the project to check requireProposals setting
    const project = await tx.projects.getById({
      id: config.projectId,
      currentUserEmail: req.currentUserEmail,
    });
    if (!project) {
      throw new BadRequestError('Project not found');
    }

    if (project.requireProposals) {
      throw new BadRequestError(
        'Direct config changes are disabled. Please create a proposal instead.',
      );
    }

    // Patch variants first (if any)
    if (req.variants && req.variants.length > 0) {
      for (const variantChange of req.variants) {
        await tx.configService.patchConfigVariant(ctx, {
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
      await tx.configService.patchConfig(ctx, {
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
