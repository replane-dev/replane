import assert from 'assert';
import type {DateProvider} from '../date-provider';
import {BadRequestError} from '../errors';
import type {Override} from '../override-condition-schemas';
import type {TransactionalUseCase} from '../use-case';
import type {NormalizedEmail} from '../zod';

export interface PatchConfigVariantRequest {
  configVariantId: string;
  value?: {newValue: any};
  schema?: {newSchema: any};
  overrides?: {newOverrides: Override[]};
  currentUserEmail: NormalizedEmail;
  prevVersion: number;
}

export interface PatchConfigVariantResponse {}

export interface PatchConfigVariantUseCaseDeps {
  dateProvider: DateProvider;
}

export function createPatchConfigVariantUseCase(
  deps: PatchConfigVariantUseCaseDeps,
): TransactionalUseCase<PatchConfigVariantRequest, PatchConfigVariantResponse> {
  return async (ctx, tx, req) => {
    const currentUser = await tx.users.getByEmail(req.currentUserEmail);
    assert(currentUser, 'Current user not found');

    // Get the config variant to find the config and then the project
    const variant = await tx.configVariants.getById(req.configVariantId);
    if (!variant) {
      throw new BadRequestError('Config variant not found');
    }

    const config = await tx.configs.getById(variant.configId);
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

    if (project.requireProposals) {
      throw new BadRequestError(
        'Direct config variant changes are disabled. Please create a proposal instead.',
      );
    }

    await tx.configService.patchConfigVariant({
      configVariantId: req.configVariantId,
      value: req.value,
      schema: req.schema,
      overrides: req.overrides,
      patchAuthor: currentUser,
      reviewer: currentUser,
      prevVersion: req.prevVersion,
    });

    return {};
  };
}
