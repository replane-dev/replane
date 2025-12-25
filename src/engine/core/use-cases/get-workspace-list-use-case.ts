import {requireUserEmail, type Identity} from '../identity';
import type {TransactionalUseCase} from '../use-case';
import type {WorkspaceListItem} from '../workspace-query-service';

export type {WorkspaceListItem};

export interface GetWorkspaceListRequest {
  identity: Identity;
}

export type GetWorkspaceListResponse = WorkspaceListItem[];

export function createGetWorkspaceListUseCase(): TransactionalUseCase<
  GetWorkspaceListRequest,
  GetWorkspaceListResponse
> {
  return async (ctx, tx, req) => {
    // This operation requires a user identity since workspaces are user-specific
    const currentUserEmail = requireUserEmail(req.identity);

    const workspaces = await tx.workspaceQueryService.getOrCreateUserWorkspaces({
      ctx,
      identity: req.identity,
    });

    return workspaces;
  };
}
