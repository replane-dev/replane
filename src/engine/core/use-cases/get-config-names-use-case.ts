import {UseCase} from '../use-case';

export interface GetConfigNamesRequest {}

export interface GetConfigNamesResponse {
  names: string[];
}

export interface GetConfigNamesUseCasesDeps {}

export function createGetConfigNamesUseCase(
  deps: GetConfigNamesUseCasesDeps,
): UseCase<GetConfigNamesRequest, GetConfigNamesResponse> {
  return async (ctx, tx) => {
    const configs = await tx.configStore.getAll();
    return {names: configs.map(config => config.name)};
  };
}
