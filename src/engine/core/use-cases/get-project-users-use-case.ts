import type {Identity} from '../identity';
import type {ProjectUser} from '../project-query-service';
import type {TransactionalUseCase} from '../use-case';

export type {ProjectUser};

export interface GetProjectUsersRequest {
  projectId: string;
  identity: Identity;
}

export interface GetProjectUsersResponse {
  users: ProjectUser[];
}

export function createGetProjectUsersUseCase(): TransactionalUseCase<
  GetProjectUsersRequest,
  GetProjectUsersResponse
> {
  return async (ctx, tx, req) => {
    await tx.permissionService.ensureCanReadMembers(ctx, {
      projectId: req.projectId,
      identity: req.identity,
    });

    const users = await tx.projectQueryService.getProjectUsers({
      projectId: req.projectId,
    });

    return {users};
  };
}
