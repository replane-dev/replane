import assert from 'assert';
import {ForbiddenError, NotFoundError} from '../errors';
import {createAuditLogId} from '../stores/audit-log-store';
import type {TransactionalUseCase} from '../use-case';
import type {NormalizedEmail} from '../zod';

export interface DeleteWorkspaceRequest {
  workspaceId: string;
  currentUserEmail: NormalizedEmail;
}

export interface DeleteWorkspaceResponse {
  success: boolean;
}

export function createDeleteWorkspaceUseCase(): TransactionalUseCase<
  DeleteWorkspaceRequest,
  DeleteWorkspaceResponse
> {
  return async (ctx, tx, req) => {
    const now = new Date();

    const workspace = await tx.workspaces.getById({
      id: req.workspaceId,
      currentUserEmail: req.currentUserEmail,
    });

    if (!workspace) {
      throw new NotFoundError('Workspace not found');
    }

    // Only admins can delete workspaces
    if (workspace.myRole !== 'admin') {
      throw new ForbiddenError('Only workspace admins can delete the workspace');
    }

    const user = await tx.users.getByEmail(req.currentUserEmail);
    assert(user, 'Current user not found');

    await tx.auditLogs.create({
      id: createAuditLogId(),
      createdAt: now,
      projectId: null,
      userId: user.id,
      configId: null,
      payload: {
        type: 'workspace_deleted',
        workspace: {
          id: req.workspaceId,
          name: workspace.name,
        },
      },
    });

    await tx.workspaces.deleteById(req.workspaceId);

    return {success: true};
  };
}
