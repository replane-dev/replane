import type {ConfigsReplica} from '../configs-replica';
import type {UseCase} from '../use-case';

export interface GetConfigValueRequest {
  name: string;
  projectId: string;
}

export interface GetConfigValueResponse {
  value: unknown | undefined; // undefined when config not found
}

export interface GetConfigValueUseCaseDeps {
  configsReplica: ConfigsReplica;
}

export function createGetConfigValueUseCase(
  deps: GetConfigValueUseCaseDeps,
): UseCase<GetConfigValueRequest, GetConfigValueResponse> {
  return async (_ctx, tx, req) => {
    const configValue = await deps.configsReplica.getConfigValue({
      projectId: req.projectId,
      name: req.name,
    });
    return {value: configValue};
  };
}
