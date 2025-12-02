import type {ConfigsReplicaService} from '../configs-replica-service';
import type {UseCase} from '../use-case';

export interface GetSdkConfigRequest {
  name: string;
  projectId: string;
  environmentId: string;
}

export interface GetSdkConfigResponse {
  name: string;
  value: unknown;
  overrides: unknown;
  version: number;
}

export interface GetSdkConfigUseCaseDeps {
  configsReplica: ConfigsReplicaService;
}

export function createGetSdkConfigUseCase(
  deps: GetSdkConfigUseCaseDeps,
): UseCase<GetSdkConfigRequest, GetSdkConfigResponse | null> {
  return async (_ctx, req) => {
    const config = deps.configsReplica.getConfig({
      projectId: req.projectId,
      name: req.name,
      environmentId: req.environmentId,
    });

    if (!config) {
      return null;
    }

    return {
      name: config.name,
      value: config.value,
      overrides: config.renderedOverrides,
      version: config.version,
    };
  };
}
