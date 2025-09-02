import {BadRequestError} from '../errors';
import type {UseCase} from '../use-case';

export interface DeleteConfigRequest {
  name: string;
}

export interface DeleteConfigResponse {}

export function createDeleteConfigUseCase(): UseCase<DeleteConfigRequest, DeleteConfigResponse> {
  return async (ctx, tx, req) => {
    const existingConfig = await tx.configs.get(req.name);
    if (!existingConfig) {
      throw new BadRequestError('Config with this name does not exist');
    }

    await tx.configs.delete(req.name);

    return {};
  };
}
