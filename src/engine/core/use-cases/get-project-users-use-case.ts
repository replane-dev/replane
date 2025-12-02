import type {TransactionalUseCase} from '../use-case';
import type {NormalizedEmail} from '../zod';

export interface GetProjectUsersRequest {
  projectId: string;
  currentUserEmail: NormalizedEmail;
}

export interface GetProjectUsersResponse {
  users: Array<{email: string; role: 'admin' | 'maintainer'}>;
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

    const users = await tx.projectUsers.getByProjectId(req.projectId);
    return {
      users: users.map(u => ({
        email: u.user_email_normalized,
        role: u.role as 'admin' | 'maintainer',
      })),
    };
  };
}
