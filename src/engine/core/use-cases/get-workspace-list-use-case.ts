import {isApiKeyIdentity, isSuperuserIdentity, isUserIdentity, type Identity} from '../identity';
import type {TransactionalUseCase} from '../use-case';
import {assertNever} from '../utils';
import type {WorkspaceListItem} from '../workspace-service';

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
    if (isUserIdentity(req.identity)) {
      // User identity: get workspaces the user is a member of
      const workspaces = await tx.workspaceService.getOrCreateUserWorkspaces({
        ctx,
        identity: req.identity,
      });
      return workspaces;
    }

    if (isSuperuserIdentity(req.identity)) {
      // Superuser: return all workspaces in the instance
      return tx.workspaceService.getAllWorkspaces(req.identity);
    }

    if (isApiKeyIdentity(req.identity)) {
      // API key identity: return the workspace the API key belongs to
      const workspace = await tx.workspaces.getByIdSimple(req.identity.workspaceId);
      if (!workspace) {
        return [];
      }
      return [
        {
          id: workspace.id,
          name: workspace.name,
          autoAddNewUsers: workspace.autoAddNewUsers,
          logo: workspace.logo,
          createdAt: workspace.createdAt,
          updatedAt: workspace.updatedAt,
          myRole: 'admin' as const, // API keys have admin-level access to their workspace
        },
      ];
    }

    assertNever(req.identity, 'Invalid identity type');
  };
}
