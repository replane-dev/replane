import assert from 'assert';
import {createAuditMessageId} from '../audit-message-store';
import {createConfigVersionId} from '../config-version-store';
import type {DateProvider} from '../date-provider';
import {BadRequestError} from '../errors';
import type {TransactionalUseCase} from '../use-case';
import {normalizeEmail} from '../utils';
import type {NormalizedEmail} from '../zod';

export interface RestoreConfigVersionRequest {
  name: string;
  versionToRestore: number;
  expectedCurrentVersion: number;
  currentUserEmail: NormalizedEmail;
  projectId: string;
}

export interface RestoreConfigVersionResponse {
  newVersion: number;
}

export interface RestoreConfigVersionUseCaseDeps {
  dateProvider: DateProvider;
}

export function createRestoreConfigVersionUseCase(
  deps: RestoreConfigVersionUseCaseDeps,
): TransactionalUseCase<RestoreConfigVersionRequest, RestoreConfigVersionResponse> {
  return async (_ctx, tx, req) => {
    const config = await tx.configs.getByName({
      name: req.name,
      projectId: req.projectId,
    });
    if (!config) {
      throw new BadRequestError('Config does not exist');
    }

    if (config.version !== req.expectedCurrentVersion) {
      throw new BadRequestError('Config was edited by another user. Please, refresh the page.');
    }

    await tx.permissionService.ensureCanEditConfig(config.id, req.currentUserEmail);

    const versionSnapshot = await tx.configVersions.getByConfigIdAndVersion(
      config.id,
      req.versionToRestore,
    );
    if (!versionSnapshot) {
      throw new BadRequestError('Specified version not found');
    }

    const currentUser = await tx.users.getByEmail(req.currentUserEmail);
    assert(currentUser, 'Current user not found');

    const nextVersion = config.version + 1;
    const now = deps.dateProvider.now();

    const beforeConfig = config;

    await tx.configs.updateById({
      id: config.id,
      value: versionSnapshot.value,
      schema: versionSnapshot.schema,
      description: versionSnapshot.description,
      updatedAt: now,
      version: nextVersion,
      overrides: versionSnapshot.overrides,
    });

    // Get current members (restore doesn't change members, only value/schema/description)
    const configUsers = await tx.configUsers.getByConfigId(config.id);

    await tx.configVersions.create({
      configId: config.id,
      createdAt: now,
      description: versionSnapshot.description,
      id: createConfigVersionId(),
      name: config.name,
      schema: versionSnapshot.schema,
      value: versionSnapshot.value,
      version: nextVersion,
      members: configUsers.map(u => ({
        normalizedEmail: normalizeEmail(u.user_email_normalized),
        role: u.role,
      })),
      authorId: currentUser.id,
      proposalId: null,
      overrides: versionSnapshot.overrides,
    });

    const afterConfig = await tx.configs.getById(config.id);
    assert(afterConfig, 'Config not found after update');
    await tx.auditMessages.create({
      id: createAuditMessageId(),
      createdAt: now,
      userId: currentUser.id,
      configId: afterConfig.id,
      projectId: afterConfig.projectId,
      payload: {
        type: 'config_version_restored',
        restoredFromVersion: versionSnapshot.version,
        before: {
          id: beforeConfig.id,
          projectId: beforeConfig.projectId,
          name: beforeConfig.name,
          value: beforeConfig.value,
          schema: beforeConfig.schema,
          description: beforeConfig.description,
          creatorId: beforeConfig.creatorId,
          createdAt: beforeConfig.createdAt,
          updatedAt: beforeConfig.updatedAt,
          version: beforeConfig.version,
          overrides: beforeConfig.overrides,
        },
        after: {
          id: afterConfig.id,
          projectId: afterConfig.projectId,
          name: afterConfig.name,
          value: afterConfig.value,
          schema: afterConfig.schema,
          description: afterConfig.description,
          creatorId: afterConfig.creatorId,
          createdAt: afterConfig.createdAt,
          updatedAt: afterConfig.updatedAt,
          version: afterConfig.version,
          overrides: afterConfig.overrides,
        },
      },
    });

    return {newVersion: nextVersion};
  };
}
