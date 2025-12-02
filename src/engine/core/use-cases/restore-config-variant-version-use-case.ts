import assert from 'assert';
import type {DateProvider} from '../date-provider';
import {BadRequestError} from '../errors';
import type {TransactionalUseCase} from '../use-case';
import type {NormalizedEmail} from '../zod';

export interface RestoreConfigVariantVersionRequest {
  configId: string;
  environmentId: string;
  versionToRestore: number;
  expectedCurrentVersion: number;
  currentUserEmail: NormalizedEmail;
  projectId: string;
}

export interface RestoreConfigVariantVersionResponse {
  newVersion: number;
}

export interface RestoreConfigVariantVersionUseCaseDeps {
  dateProvider: DateProvider;
}

export function createRestoreConfigVariantVersionUseCase(
  deps: RestoreConfigVariantVersionUseCaseDeps,
): TransactionalUseCase<RestoreConfigVariantVersionRequest, RestoreConfigVariantVersionResponse> {
  return async (ctx, tx, req) => {
    await tx.permissionService.ensureIsWorkspaceMember(ctx, {
      projectId: req.projectId,
      currentUserEmail: req.currentUserEmail,
    });

    // Get the config to verify it exists and belongs to the project
    const config = await tx.configs.getById(req.configId);
    if (!config) {
      throw new BadRequestError('Config does not exist');
    }
    if (config.projectId !== req.projectId) {
      throw new BadRequestError('Config does not belong to the specified project');
    }

    // TODO: if the the restore operation doesn't change schema, we might relax permissions to edit config only
    await tx.permissionService.ensureCanManageConfig(ctx, {
      configId: config.id,
      currentUserEmail: req.currentUserEmail,
    });

    // Get the variant for this config and environment
    const variant = await tx.configVariants.getByConfigIdAndEnvironmentId({
      configId: req.configId,
      environmentId: req.environmentId,
    });
    if (!variant) {
      throw new BadRequestError('Config variant not found for the specified environment');
    }

    if (variant.version !== req.expectedCurrentVersion) {
      throw new BadRequestError('Config was edited by another user. Please, refresh the page.');
    }

    // Get the version snapshot to restore from
    const versionSnapshot = await tx.configVariantVersions.getByConfigVariantIdAndVersion({
      configVariantId: variant.id,
      version: req.versionToRestore,
    });
    if (!versionSnapshot) {
      throw new BadRequestError('Specified version not found');
    }

    const currentUser = await tx.users.getByEmail(req.currentUserEmail);
    assert(currentUser, 'Current user not found');

    await tx.configService.patchConfigVariant(ctx, {
      configVariantId: variant.id,
      value: {newValue: versionSnapshot.value},
      schema: {newSchema: versionSnapshot.schema},
      overrides: {newOverrides: versionSnapshot.overrides},
      patchAuthor: currentUser,
      reviewer: currentUser,
      prevVersion: variant.version,
    });

    return {newVersion: variant.version + 1};
  };
}
