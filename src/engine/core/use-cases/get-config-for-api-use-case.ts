import type {ConfigsReplica} from '../configs-replica';
import type {RenderedOverride} from '../override-evaluator';
import type {UseCase} from '../use-case';

export interface GetConfigForApiRequest {
  name: string;
  projectId: string;
}

export interface GetConfigForApiResponse {
  name: string;
  value: unknown;
  renderedOverrides: RenderedOverride[];
  version: number;
}

export interface GetConfigForApiUseCaseDeps {
  configsReplica: ConfigsReplica;
}

export function createGetConfigForApiUseCase(
  deps: GetConfigForApiUseCaseDeps,
): UseCase<GetConfigForApiRequest, GetConfigForApiResponse | null> {
  return async (_ctx, req) => {
    const config = deps.configsReplica.getConfig({
      projectId: req.projectId,
      name: req.name,
    });

    if (!config) {
      return null;
    }

    return {
      name: config.name,
      value: config.value,
      renderedOverrides: config.renderedOverrides,
      version: config.version,
    };
  };
}
