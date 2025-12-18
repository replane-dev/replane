import type {RenderedOverride} from '../override-condition-schemas';
import type {ReplicaService} from '../replica';
import type {UseCase} from '../use-case';

export interface GetSdkConfigsRequest {
  projectId: string;
  environmentId: string;
}

export interface GetSdkConfigsResponse {
  configs: Array<{
    name: string;
    value: unknown;
    overrides: RenderedOverride[];
  }>;
}

export interface GetSdkConfigsUseCaseDeps {
  configsReplica: ReplicaService;
}

export function createGetSdkConfigsUseCase(
  deps: GetSdkConfigsUseCaseDeps,
): UseCase<GetSdkConfigsRequest, GetSdkConfigsResponse> {
  return async (_ctx, req) => {
    const configs = await deps.configsReplica.getProjectConfigs({
      projectId: req.projectId,
      environmentId: req.environmentId,
    });

    return {
      configs: configs.map(config => ({
        name: config.name,
        value: config.value,
        overrides: config.overrides,
      })),
    };
  };
}
