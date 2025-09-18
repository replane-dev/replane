import assert from 'assert';
import {createAuditMessageId} from '../audit-message-store';
import type {ConfigId} from '../config-store';
import {BadRequestError} from '../errors';
import type {UseCase} from '../use-case';
import type {NormalizedEmail} from '../zod';

export interface DeleteConfigRequest {
  configId: ConfigId;
  currentUserEmail: NormalizedEmail;
}

export interface DeleteConfigResponse {}

export function createDeleteConfigUseCase(): UseCase<DeleteConfigRequest, DeleteConfigResponse> {
  return async (ctx, tx, req) => {
    const existingConfig = await tx.configs.getById(req.configId);
    if (!existingConfig) {
      throw new BadRequestError('Config with this name does not exist');
    }

    await tx.permissionService.ensureCanManageConfig(existingConfig.id, req.currentUserEmail);

    await tx.configs.deleteById(existingConfig.id);

    const currentUser = await tx.users.getByEmail(req.currentUserEmail);

    assert(currentUser, 'Current user not found');

    await tx.auditMessages.create({
      id: createAuditMessageId(),
      createdAt: new Date(),
      userId: currentUser.id,
      configId: null,
      projectId: existingConfig.projectId,
      payload: {
        type: 'config_deleted',
        config: {
          id: existingConfig.id,
          projectId: existingConfig.projectId,
          name: existingConfig.name,
          value: existingConfig.value,
          schema: existingConfig.schema,
          description: existingConfig.description,
          creatorId: existingConfig.creatorId,
          createdAt: existingConfig.createdAt,
          updatedAt: existingConfig.updatedAt,
          version: existingConfig.version,
        },
      },
    });

    return {};
  };
}
