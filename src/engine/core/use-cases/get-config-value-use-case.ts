import type {ConfigsReplicaService} from '../configs-replica-service';
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
  configsReplica: ConfigsReplicaService;
}

export function createGetConfigValueUseCase(
  deps: GetConfigValueUseCaseDeps,
): UseCase<GetConfigValueRequest, GetConfigValueResponse> {
  return async (_ctx, req) => {
    // permissions must be checked by the caller

    const configValue = await deps.configsReplica.getConfigValue({
      projectId: req.projectId,
      name: req.name,
      environmentId: req.environmentId,
      context: req.context,
    });
    return {value: configValue};
  };
}
