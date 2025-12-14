import assert from 'assert';
import type {Context} from '../context';
import {BadRequestError} from '../errors';
import type {Override} from '../override-condition-schemas';
import type {TransactionalUseCase} from '../use-case';
import type {ConfigSchema, ConfigValue, NormalizedEmail} from '../zod';

export interface RestoreConfigVersionRequest {
  configId: string;
  versionToRestore: number;
  expectedCurrentVersion: number;
  currentUserEmail: NormalizedEmail;
  projectId: string;
}

export interface RestoreConfigVersionResponse {
  newVersion: number;
}

export function createRestoreConfigVersionUseCase(): TransactionalUseCase<
  RestoreConfigVersionRequest,
  RestoreConfigVersionResponse
> {
  return async (ctx: Context, tx, req) => {
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

    // TODO: if the restore operation doesn't change schema, we might relax permissions to edit config only
    await tx.permissionService.ensureCanManageConfig(ctx, {
      configId: config.id,
      currentUserEmail: req.currentUserEmail,
    });

    // Check config version
    if (config.version !== req.expectedCurrentVersion) {
      throw new BadRequestError('Config was edited by another user. Please, refresh the page.');
    }

    const currentVariants = await tx.configVariants.getByConfigId(req.configId);

    // Fetch all version snapshots at the specified config version
    const versionSnapshots: Array<{
      configVariantId: string;
      environmentId: string;
      value: ConfigValue;
      schema: ConfigSchema | null;
      overrides: Override[];
      useDefaultSchema: boolean;
    }> = [];

    for (const variant of currentVariants) {
      const snapshot = await tx.configVariantVersions.getByConfigVariantIdAndVersion({
        configVariantId: variant.id,
        version: req.versionToRestore,
      });
      if (snapshot) {
        versionSnapshots.push({
          configVariantId: variant.id,
          environmentId: variant.environmentId,
          value: snapshot.value,
          schema: snapshot.schema,
          overrides: snapshot.overrides,
          useDefaultSchema: variant.useDefaultSchema,
        });
      }
    }

    // Find version metadata from any snapshot (they share the same description at the same version)
    let snapshotDetail = null;
    if (versionSnapshots.length > 0) {
      snapshotDetail = await tx.configVariantVersions.getByConfigVariantIdAndVersion({
        configVariantId: versionSnapshots[0].configVariantId,
        version: req.versionToRestore,
      });
    }

    if (!snapshotDetail) {
      throw new BadRequestError('Version snapshot not found');
    }

    const currentUser = await tx.users.getByEmail(req.currentUserEmail);
    assert(currentUser, 'Current user not found');

    // Reconstruct environment variants from version snapshots
    const environmentVariants = versionSnapshots.map(snapshot => ({
      environmentId: snapshot.environmentId,
      value: snapshot.value,
      schema: snapshot.schema,
      overrides: snapshot.overrides,
      useDefaultSchema: snapshot.useDefaultSchema,
    }));

    // Default variant comes from current config (restore doesn't change default variant for now)
    // TODO: Add version tracking for default variant in configs table
    const defaultVariant = {
      value: config.value,
      schema: config.schema,
      overrides: config.overrides,
    };

    // Get current members (restore doesn't change members)
    const currentMembers = await tx.configUsers.getByConfigId(req.configId);
    const editorEmails = currentMembers
      .filter(m => m.role === 'editor')
      .map(m => m.user_email_normalized);
    const maintainerEmails = currentMembers
      .filter(m => m.role === 'maintainer')
      .map(m => m.user_email_normalized);

    // Call updateConfig with the reconstructed state
    await tx.configService.updateConfig(ctx, {
      configId: req.configId,
      description: snapshotDetail.description,
      editorEmails,
      maintainerEmails,
      defaultVariant,
      environmentVariants,
      currentUser,
      reviewer: currentUser,
      prevVersion: config.version,
    });

    return {newVersion: config.version + 1};
  };
}
