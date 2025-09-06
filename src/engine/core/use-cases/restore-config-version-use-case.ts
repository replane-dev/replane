import assert from 'node:assert';
import {createConfigVersionId} from '../config-version-store';
import type {DateProvider} from '../date-provider';
import {BadRequestError} from '../errors';
import type {UseCase} from '../use-case';
import type {NormalizedEmail} from '../zod';

export interface RestoreConfigVersionRequest {
  name: string;
  versionToRestore: number;
  expectedCurrentVersion: number;
  currentUserEmail: NormalizedEmail;
}

export interface RestoreConfigVersionResponse {
  newVersion: number;
}

export interface RestoreConfigVersionUseCaseDeps {
  dateProvider: DateProvider;
}

export function createRestoreConfigVersionUseCase(
  deps: RestoreConfigVersionUseCaseDeps,
): UseCase<RestoreConfigVersionRequest, RestoreConfigVersionResponse> {
  return async (_ctx, tx, req) => {
    const config = await tx.configs.getByName(req.name);
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

    await tx.configs.updateById({
      id: config.id,
      value: versionSnapshot.value,
      schema: versionSnapshot.schema,
      description: versionSnapshot.description,
      updatedAt: now,
      version: nextVersion,
    });

    await tx.configVersions.create({
      configId: config.id,
      createdAt: now,
      description: versionSnapshot.description,
      id: createConfigVersionId(),
      name: config.name,
      schema: versionSnapshot.schema,
      value: versionSnapshot.value,
      version: nextVersion,
      authorId: currentUser.id,
    });

    return {newVersion: nextVersion};
  };
}
