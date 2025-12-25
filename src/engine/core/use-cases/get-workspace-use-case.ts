import {NotFoundError} from '../errors';
import type {Identity} from '../identity';
import {isUserIdentity} from '../identity';
import type {Workspace} from '../stores/workspace-store';
import type {TransactionalUseCase} from '../use-case';

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

    const currentUserEmail = isUserIdentity(req.identity) ? req.identity.user.email : undefined;

    const workspace = currentUserEmail
      ? await tx.workspaces.getById({
          id: req.workspaceId,
          currentUserEmail,
        })
      : await tx.workspaces.getByIdSimple(req.workspaceId);

    if (!workspace) {
      throw new NotFoundError('Workspace not found');
    }

    return workspace;
  };
}
