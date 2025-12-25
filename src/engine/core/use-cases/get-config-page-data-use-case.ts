import type {ConfigDetails} from '../config-query-service';
import type {Identity} from '../identity';
import type {ProjectDetails, ProjectEnvironment, ProjectUser} from '../project-query-service';
import type {TransactionalUseCase} from '../use-case';

export interface GetConfigPageDataRequest {
  configName: string;
  projectId: string;
  identity: Identity;
}

export interface GetConfigPageDataResponse {
  config: ConfigDetails | undefined;
  project: ProjectDetails | null;
  environments: ProjectEnvironment[];
  projectUsers: ProjectUser[];
}

export function createGetConfigPageDataUseCase(): TransactionalUseCase<
  GetConfigPageDataRequest,
  GetConfigPageDataResponse
> {
  return async (ctx, tx, req) => {
    await tx.permissionService.ensureIsWorkspaceMember(ctx, {
      projectId: req.projectId,
      identity: req.identity,
    });

    const [config, project, environments, projectUsers] = await Promise.all([
      tx.configQueryService.getConfigDetails(ctx, {
        name: req.configName,
        projectId: req.projectId,
        identity: req.identity,
      }),
      tx.projectQueryService.getProject(ctx, {
        id: req.projectId,
        identity: req.identity,
      }),
      tx.projectQueryService.getEnvironments({
        projectId: req.projectId,
      }),
      tx.projectQueryService.getProjectUsers({
        projectId: req.projectId,
      }),
    ]);

    return {config, project, environments, projectUsers};
  };
}
