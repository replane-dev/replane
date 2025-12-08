import type {TransactionalUseCase} from '../use-case';
import type {WorkspaceListItem} from '../workspace-query-service';
import type {NormalizedEmail} from '../zod';

export type {WorkspaceListItem};

export interface GetWorkspaceListRequest {
  currentUserEmail: NormalizedEmail;
}

export type GetWorkspaceListResponse = WorkspaceListItem[];

export function createGetWorkspaceListUseCase(): TransactionalUseCase<
  GetWorkspaceListRequest,
  GetWorkspaceListResponse
> {
  return async (_ctx, tx, req) => {
    return await tx.workspaceQueryService.getWorkspaceList({
      currentUserEmail: req.currentUserEmail,
    });
  };
}
