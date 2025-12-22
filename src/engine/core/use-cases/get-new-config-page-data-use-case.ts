import type {Identity} from '../identity';
import type {ProjectEnvironment, ProjectUser} from '../project-query-service';
import type {TransactionalUseCase} from '../use-case';

export interface GetNewConfigPageDataRequest {
  projectId: string;
  identity: Identity;
}

export interface GetNewConfigPageDataResponse {
  environments: ProjectEnvironment[];
  projectUsers: ProjectUser[];
}

export function createGetNewConfigPageDataUseCase(): TransactionalUseCase<
  GetNewConfigPageDataRequest,
  GetNewConfigPageDataResponse
> {
  return async (ctx, tx, req) => {
    await tx.permissionService.ensureIsWorkspaceMember(ctx, {
      projectId: req.projectId,
      identity: req.identity,
    });

    const [environments, projectUsers] = await Promise.all([
      tx.projectQueryService.getEnvironments({
        projectId: req.projectId,
      }),
      tx.projectQueryService.getProjectUsers({
        projectId: req.projectId,
      }),
    ]);

    return {environments, projectUsers};
  };
}
