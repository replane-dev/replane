import assert from 'assert';
import type {Context} from '../context';
import {BadRequestError} from '../errors';
import {getUserIdFromIdentity, requireUserEmail, type Identity} from '../identity';
import type {TransactionalUseCase} from '../use-case';
import type {ConfigSchema, ConfigValue} from '../zod';

export interface RestoreConfigVersionRequest {
  configId: string;
  versionToRestore: number;
  expectedCurrentVersion: number;
  identity: Identity;
  projectId: string;
}

export interface RestoreConfigVersionResponse {
  newVersion?: number;
}

export function createRestoreConfigVersionUseCase(): TransactionalUseCase<
  RestoreConfigVersionRequest,
  RestoreConfigVersionResponse
> {
  return async (ctx: Context, tx, req) => {
    // Restoring config versions requires a user identity
    const currentUserEmail = requireUserEmail(req.identity);

    await tx.permissionService.ensureIsWorkspaceMember(ctx, {
      projectId: req.projectId,
      identity: req.identity,
    });

    // Get the config to verify it exists and belongs to the project
    const config = await tx.configs.getById({
      id: req.configId,
      projectId: req.projectId,
    });
    if (!config) {
      throw new BadRequestError('Config does not exist');
    }

    // TODO: if the restore operation doesn't change schema, we might relax permissions to edit config only
    await tx.permissionService.ensureCanManageConfig(ctx, {
      configId: config.id,
      identity: req.identity,
    });

    // Check config version
    if (config.version !== req.expectedCurrentVersion) {
      throw new BadRequestError('Config was edited by another user. Please, refresh the page.');
    }

    // Fetch the version snapshot to restore
    const versionSnapshot = await tx.configVersions.getByConfigIdAndVersion({
      configId: req.configId,
      version: req.versionToRestore,
      projectId: req.projectId,
    });

    if (!versionSnapshot) {
      throw new BadRequestError('Version snapshot not found');
    }

    const currentUser = await tx.users.getByEmail(currentUserEmail);
    assert(currentUser, 'Current user not found');

    // Reconstruct environment variants from version snapshot
    const environmentVariants = versionSnapshot.variants.map(variant => ({
      environmentId: variant.environmentId,
      value: variant.value as ConfigValue,
      schema: variant.schema as ConfigSchema | null,
      overrides: variant.overrides,
      useBaseSchema: variant.useBaseSchema,
    }));

    // Default variant comes from version snapshot
    const defaultVariant = {
      value: versionSnapshot.value as ConfigValue,
      schema: versionSnapshot.schema as ConfigSchema | null,
      overrides: versionSnapshot.overrides,
    };

    // Get current members for comparison (restore doesn't change current members but uses version members)
    const currentMembers = await tx.configUsers.getByConfigId({
      configId: req.configId,
      projectId: req.projectId,
    });
    const currentEditorEmails = currentMembers
      .filter(m => m.role === 'editor')
      .map(m => m.user_email_normalized);
    const currentMaintainerEmails = currentMembers
      .filter(m => m.role === 'maintainer')
      .map(m => m.user_email_normalized);

    // Get the project to check requireProposals setting
    const project = await tx.projects.getById({
      id: config.projectId,
      currentUserEmail,
    });
    if (!project) {
      throw new BadRequestError('Project not found');
    }

    // Get current variants for approval check
    const currentVariants = await tx.configVariants.getByConfigId({
      configId: req.configId,
      projectId: req.projectId,
    });

    // Check if approval is required using the new per-environment logic
    if (project.requireProposals) {
      const approvalResult = await tx.configService.isApprovalRequired({
        project,
        existingConfig: config,
        currentVariants: currentVariants.map(v => ({
          id: v.id,
          environmentId: v.environmentId,
          value: v.value,
          schema: v.schema,
          overrides: v.overrides,
        })),
        proposedDefaultVariant: defaultVariant,
        proposedEnvironmentVariants: environmentVariants,
        currentMembers: {
          editorEmails: currentEditorEmails,
          maintainerEmails: currentMaintainerEmails,
        },
        // config restore doesn't change members, so we use the current members
        proposedMembers: {
          editorEmails: currentEditorEmails,
          maintainerEmails: currentMaintainerEmails,
        },
      });

      if (approvalResult.required) {
        throw new BadRequestError(
          `Direct config restore is disabled. ${approvalResult.reason}. Please create a proposal instead.`,
          {
            code: 'APPROVAL_REQUIRED',
          },
        );
      }
    }

    // Call updateConfig with the reconstructed state from version snapshot
    await tx.configService.updateConfig(ctx, {
      configId: req.configId,
      projectId: req.projectId,
      description: versionSnapshot.description,
      editorEmails: currentEditorEmails,
      maintainerEmails: currentMaintainerEmails,
      defaultVariant,
      environmentVariants,
      editAuthorId: getUserIdFromIdentity(req.identity),
      reviewer: req.identity,
      prevVersion: config.version,
    });

    return {newVersion: config.version + 1};
  };
}
