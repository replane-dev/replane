import {NotFoundError} from '../errors';
import type {Workspace} from '../stores/workspace-store';
import type {TransactionalUseCase} from '../use-case';
import type {NormalizedEmail} from '../zod';

export interface GetWorkspaceRequest {
  workspaceId: string;
  currentUserEmail: NormalizedEmail;
}

export type GetWorkspaceResponse = Workspace & {myRole?: 'admin' | 'member'};

export function createGetWorkspaceUseCase(): TransactionalUseCase<
  GetWorkspaceRequest,
  GetWorkspaceResponse
> {
  return async (ctx, tx, req) => {
    await tx.permissionService.ensureIsWorkspaceMember(ctx, {
      workspaceId: req.workspaceId,
      currentUserEmail: req.currentUserEmail,
    });

    const workspace = await tx.workspaces.getById({
      id: req.workspaceId,
      currentUserEmail: req.currentUserEmail,
    });

    if (!workspace) {
      throw new NotFoundError('Workspace not found');
    }

    return workspace;
  };
}
