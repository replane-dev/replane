import {Config} from '../config-store';
import {UseCase} from '../use-case';

export interface GetConfigRequest {
  name: string;
}

export interface GetConfigResponse {
  config: Config | undefined;
}

export interface GetConfigUseCasesDeps {}

export function createGetConfigUseCase(deps: GetConfigUseCasesDeps): UseCase<GetConfigRequest, GetConfigResponse> {
  return async (ctx, tx, req) => {
    const config = await tx.configStore.get(req.name);
    if (!config) {
      return {config: undefined};
    }

    return {
      config: {
        name: config.name,
        value: config.value,
      },
    };
  };
}
