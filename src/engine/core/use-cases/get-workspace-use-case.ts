import {NotFoundError} from '../errors';
import {isApiKeyIdentity, isSuperuserIdentity, isUserIdentity, type Identity} from '../identity';
import type {Workspace} from '../stores/workspace-store';
import type {TransactionalUseCase} from '../use-case';
import {assertNever} from '../utils';

export interface GetWorkspaceRequest {
  workspaceId: string;
  identity: Identity;
}

export type GetWorkspaceResponse = Workspace & {myRole?: 'admin' | 'member'};

export function createGetWorkspaceUseCase(): TransactionalUseCase<
  GetWorkspaceRequest,
  GetWorkspaceResponse
> {
  return async (ctx, tx, req) => {
    await tx.permissionService.ensureIsWorkspaceMember(ctx, {
      workspaceId: req.workspaceId,
      identity: req.identity,
    });

    // Superuser can access any workspace
    if (isSuperuserIdentity(req.identity)) {
      const workspace = await tx.workspaceService.getWorkspaceById(req.identity, req.workspaceId);
      if (!workspace) {
        throw new NotFoundError('Workspace not found');
      }
      return workspace;
    }

    // API key can only access its own workspace
    if (isApiKeyIdentity(req.identity)) {
      if (req.identity.workspaceId !== req.workspaceId) {
        throw new NotFoundError('Workspace not found');
      }
      const workspace = await tx.workspaces.getByIdSimple(req.workspaceId);
      if (!workspace) {
        throw new NotFoundError('Workspace not found');
      }
      return {
        ...workspace,
        myRole: 'admin' as const, // API keys have admin-level access
      };
    }

    // User identity: check permissions and return with role
    if (isUserIdentity(req.identity)) {
      const workspace = await tx.workspaces.getById({
        id: req.workspaceId,
        currentUserEmail: req.identity.user.email,
      });

      if (!workspace) {
        throw new NotFoundError('Workspace not found');
      }

      return workspace;
    }

    assertNever(req.identity, 'Invalid identity type');
  };
}
