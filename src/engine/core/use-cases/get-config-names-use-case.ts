import {ConfigStore} from '../config-store';
import {UseCase} from '../use-case';

export interface GetConfigNamesRequest {}

export interface GetConfigNamesResponse {
  names: string[];
}

export interface GetConfigNamesUseCasesDeps {
  configStore: ConfigStore;
}

export function createGetConfigNamesUseCase(
  deps: GetConfigNamesUseCasesDeps,
): UseCase<GetConfigNamesRequest, GetConfigNamesResponse> {
  return async () => {
    const configs = await deps.configStore.getAll();
    return {names: configs.map(config => config.name)};
  };
}
