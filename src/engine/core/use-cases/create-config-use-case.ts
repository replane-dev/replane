import {Config} from '../config-store';
import {BadRequestError} from '../errors';
import {UseCase} from '../use-case';

export interface CreateConfigRequest {
  config: Config;
}

export interface CreateConfigResponse {}

export interface CreateConfigUseCaseDeps {}

const CONFIG_NAME_REGEX = /^[a-z_]{1,100}$/;

export function createCreateConfigUseCase(
  deps: CreateConfigUseCaseDeps,
): UseCase<CreateConfigRequest, CreateConfigResponse> {
  return async (ctx, tx, req) => {
    const existingConfig = await tx.configStore.get(req.config.name);
    if (existingConfig) {
      throw new BadRequestError('Config with this name already exists');
    }

    await tx.configStore.put(req.config);

    return {};
  };
}
