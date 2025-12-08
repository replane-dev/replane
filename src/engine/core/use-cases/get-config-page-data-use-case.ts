import type {ConfigDetails} from '../config-query-service';
import type {ProjectDetails, ProjectEnvironment} from '../project-query-service';
import type {TransactionalUseCase} from '../use-case';
import type {NormalizedEmail} from '../zod';

export interface GetConfigPageDataRequest {
  configName: string;
  projectId: string;
  currentUserEmail: NormalizedEmail;
}

export interface GetConfigPageDataResponse {
  config: ConfigDetails | undefined;
  project: ProjectDetails | null;
  environments: ProjectEnvironment[];
}

export function createGetConfigPageDataUseCase(): TransactionalUseCase<
  GetConfigPageDataRequest,
  GetConfigPageDataResponse
> {
  return async (ctx, tx, req) => {
    await tx.permissionService.ensureIsWorkspaceMember(ctx, {
      projectId: req.projectId,
      currentUserEmail: req.currentUserEmail,
    });

    const [config, project, environments] = await Promise.all([
      tx.configQueryService.getConfigDetails({
        name: req.configName,
        projectId: req.projectId,
        currentUserEmail: req.currentUserEmail,
      }),
      tx.projectQueryService.getProject({
        id: req.projectId,
        currentUserEmail: req.currentUserEmail,
      }),
      tx.projectQueryService.getEnvironments({
        projectId: req.projectId,
      }),
    ]);

    return {config, project, environments};
  };
}
