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

    return {};
  };
}
