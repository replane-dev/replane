import type {ReplicaService} from '../replica';
import type {UseCase} from '../use-case';

export interface GetConfigValueRequest {
  name: string;
  projectId: string;
  environmentId: string;
  context?: Record<string, unknown>;
}

export interface GetConfigValueResponse {
  value: unknown | undefined; // undefined when config not found
}

export interface GetConfigValueUseCaseDeps {
  configsReplica: ReplicaService;
}

export function createGetConfigValueUseCase(
  deps: GetConfigValueUseCaseDeps,
): UseCase<GetConfigValueRequest, GetConfigValueResponse> {
  return async (_ctx, req) => {
    // permissions must be checked by the caller

    const configValue = deps.configsReplica.getConfigValue({
      projectId: req.projectId,
      configName: req.name,
      environmentId: req.environmentId,
    });
    return {value: configValue};
  };
}
