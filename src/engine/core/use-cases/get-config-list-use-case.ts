import {Config} from '../config-store';
import {UseCase} from '../use-case';

export interface GetConfigListRequest {}

export interface GetConfigListResponse {
  configs: Config[];
}

export interface GetConfigListUseCasesDeps {}

export function createGetConfigListUseCase(
  deps: GetConfigListUseCasesDeps,
): UseCase<GetConfigListRequest, GetConfigListResponse> {
  return async (ctx, tx) => {
    const configs = await tx.configStore.getAll();
    return {configs};
  };
}
