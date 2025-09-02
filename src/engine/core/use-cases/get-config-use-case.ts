import {Config} from '../config-store';
import type {UseCase} from '../use-case';

export interface GetConfigRequest {
  name: string;
}

export interface GetConfigResponse {
  config: Config | undefined;
}

export interface GetConfigUseCasesDeps {}

export function createGetConfigUseCase(
  deps: GetConfigUseCasesDeps,
): UseCase<GetConfigRequest, GetConfigResponse> {
  return async (ctx, tx, req) => {
    const config = await tx.configs.get(req.name);
    if (!config) {
      return {config: undefined};
    }

    return {
      config: {
        id: config.id,
        name: config.name,
        value: config.value,
        description: config.description,
        schema: config.schema,
        creatorId: config.creatorId,
        createdAt: config.createdAt,
        updatedAt: config.updatedAt,
      },
    };
  };
}
