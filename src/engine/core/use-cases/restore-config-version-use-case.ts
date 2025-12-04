import assert from 'assert';
import type {Context} from '../context';
import {BadRequestError} from '../errors';
import type {Override} from '../override-condition-schemas';
import type {TransactionalUseCase} from '../use-case';
import type {NormalizedEmail} from '../zod';

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

    // Get all variants for this config
    const currentVariants = await tx.configVariants.getByConfigId(req.configId);

    // Fetch all version snapshots at the specified config version
    const versionSnapshots: Array<{
      configVariantId: string;
      value: unknown;
      schema: unknown | null;
      overrides: Override[];
    }> = [];

    for (const variant of currentVariants) {
      const snapshot = await tx.configVariantVersions.getByConfigVariantIdAndVersion({
        configVariantId: variant.id,
        version: req.versionToRestore,
      });
      if (snapshot) {
        versionSnapshots.push({
          configVariantId: variant.id,
          value: snapshot.value,
          schema: snapshot.schema,
          overrides: snapshot.overrides,
        });
      }
    }

    if (versionSnapshots.length === 0) {
      throw new BadRequestError('No variants found at the specified version');
    }

    // Find the config metadata at that version
    const anySnapshot = versionSnapshots[0];
    const snapshotDetail = await tx.configVariantVersions.getByConfigVariantIdAndVersion({
      configVariantId: anySnapshot.configVariantId,
      version: req.versionToRestore,
    });
    if (!snapshotDetail) {
      throw new BadRequestError('Version snapshot not found');
    }

    const currentUser = await tx.users.getByEmail(req.currentUserEmail);
    assert(currentUser, 'Current user not found');

    // Reconstruct full config state from version snapshots
    const defaultVariantSnapshot = versionSnapshots.find(
      snapshot => currentVariants.find(v => v.id === snapshot.configVariantId)?.environmentId === null,
    );
    const environmentVariantSnapshots = versionSnapshots.filter(
      snapshot => currentVariants.find(v => v.id === snapshot.configVariantId)?.environmentId !== null,
    );

    const defaultVariant = defaultVariantSnapshot
      ? {
          value: defaultVariantSnapshot.value,
          schema: defaultVariantSnapshot.schema,
          overrides: defaultVariantSnapshot.overrides,
        }
      : undefined;

    const environmentVariants = environmentVariantSnapshots.map(snapshot => {
      const variant = currentVariants.find(v => v.id === snapshot.configVariantId)!;
      return {
        environmentId: variant.environmentId!,
        value: snapshot.value,
        schema: snapshot.schema,
        overrides: snapshot.overrides,
        useDefaultSchema: variant.useDefaultSchema,
      };
    });

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

