import type {RenderedOverride} from '../override-condition-schemas';
import type {ReplicaService} from '../replica';
import type {UseCase} from '../use-case';

export interface GetSdkConfigRequest {
  name: string;
  projectId: string;
  environmentId: string;
}

export interface GetSdkConfigResponse {
  name: string;
  value: unknown;
  overrides: RenderedOverride[];
  version: number;
}

export interface GetSdkConfigUseCaseDeps {
  replicaService: ReplicaService;
}

export function createGetSdkConfigUseCase(
  deps: GetSdkConfigUseCaseDeps,
): UseCase<GetSdkConfigRequest, GetSdkConfigResponse | null> {
  return async (_ctx, req) => {
    const config = await deps.replicaService.getConfig({
      projectId: req.projectId,
      configName: req.name,
      environmentId: req.environmentId,
    });

    if (!config) {
      return null;
    }

    return {
      name: config.name,
      value: config.value,
      overrides: config.overrides,
      version: config.version,
    };
  };
}
