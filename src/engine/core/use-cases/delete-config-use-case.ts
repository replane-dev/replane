import {BadRequestError} from '../errors';
import type {UseCase} from '../use-case';
import type {NormalizedEmail} from '../zod';

export interface DeleteConfigRequest {
  name: string;
  currentUserEmail: NormalizedEmail;
}

export interface DeleteConfigResponse {}

export function createDeleteConfigUseCase(): UseCase<DeleteConfigRequest, DeleteConfigResponse> {
  return async (ctx, tx, req) => {
    const existingConfig = await tx.configs.getByName(req.name);
    if (!existingConfig) {
      throw new BadRequestError('Config with this name does not exist');
    }

    await tx.permissionService.ensureCanManageConfig(existingConfig.id, req.currentUserEmail);

    await tx.configs.delete(req.name);

    return {};
  };
}
