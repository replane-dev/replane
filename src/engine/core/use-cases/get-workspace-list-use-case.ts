import type {WorkspaceInfo} from '../stores/workspace-store';
import type {TransactionalUseCase} from '../use-case';
import type {NormalizedEmail} from '../zod';

export interface GetWorkspaceListRequest {
  currentUserEmail: NormalizedEmail;
}

export type GetWorkspaceListResponse = WorkspaceInfo[];

export function createGetWorkspaceListUseCase(): TransactionalUseCase<
  GetWorkspaceListRequest,
  GetWorkspaceListResponse
> {
  return async (ctx, tx, req) => {
    const workspaces = await tx.workspaces.getAll({
      currentUserEmail: req.currentUserEmail,
    });

    // Only return workspaces where user is a member
    return workspaces.filter(org => org.myRole !== undefined);
  };
}
