import type {ProjectUser} from '../project-query-service';
import type {TransactionalUseCase} from '../use-case';
import type {NormalizedEmail} from '../zod';

export type {ProjectUser};

export interface GetProjectUsersRequest {
  projectId: string;
  currentUserEmail: NormalizedEmail;
}

export interface GetProjectUsersResponse {
  users: ProjectUser[];
}

export function createGetProjectUsersUseCase(): TransactionalUseCase<
  GetProjectUsersRequest,
  GetProjectUsersResponse
> {
  return async (ctx, tx, req) => {
    await tx.permissionService.ensureIsWorkspaceMember(ctx, {
      projectId: req.projectId,
      currentUserEmail: req.currentUserEmail,
    });

    const users = await tx.projectQueryService.getProjectUsers({
      projectId: req.projectId,
    });

    return {users};
  };
}
