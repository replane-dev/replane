import type {ConfigsReplicaService} from '../configs-replica-service';
import type {RenderedOverride} from '../override-condition-schemas';
import type {UseCase} from '../use-case';

export interface GetSdkConfigsRequest {
  projectId: string;
  environmentId: string;
}

export interface GetSdkConfigsResponse {
  configs: Array<{
    name: string;
    value: unknown;
    renderedOverrides: RenderedOverride[];
    overrides: RenderedOverride[];
    version: number;
  }>;
}

export interface GetSdkConfigsUseCaseDeps {
  configsReplica: ConfigsReplicaService;
}

export function createGetSdkConfigsUseCase(
  deps: GetSdkConfigsUseCaseDeps,
): UseCase<GetSdkConfigsRequest, GetSdkConfigsResponse> {
  return async (_ctx, req) => {
    const configs = deps.configsReplica.getEnvironmentConfigs({
      projectId: req.projectId,
      environmentId: req.environmentId,
    });

    return {
      configs: configs.map(config => ({
        name: config.name,
        value: config.value,
        renderedOverrides: config.renderedOverrides,
        overrides: config.renderedOverrides,
        version: config.version,
      })),
    };
  };
}
