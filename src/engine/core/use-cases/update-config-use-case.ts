import {Config} from '../config-store';
import {BadRequestError} from '../errors';
import {UseCase} from '../use-case';

export interface UpdateConfigRequest {
  config: Config;
}

export interface UpdateConfigResponse {}

export interface UpdateConfigUseCaseDeps {}

export function createUpdateConfigUseCase(
  deps: UpdateConfigUseCaseDeps,
): UseCase<UpdateConfigRequest, UpdateConfigResponse> {
  return async (ctx, tx, req) => {
    const existingConfig = await tx.configStore.get(req.config.name);
    if (!existingConfig) {
      throw new BadRequestError('Config with this name does not exist');
    }

    await tx.configStore.put(req.config);

    return {};
  };
}
