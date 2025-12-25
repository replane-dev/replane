import assert from 'assert';
import {ForbiddenError, NotFoundError} from '../errors';
import {requireUserEmail, type Identity} from '../identity';
import {createAuditLogId} from '../stores/audit-log-store';
import type {TransactionalUseCase} from '../use-case';

export interface DeleteWorkspaceRequest {
  workspaceId: string;
  identity: Identity;
}

export interface DeleteWorkspaceResponse {
  success: boolean;
}

export function createDeleteWorkspaceUseCase(): TransactionalUseCase<
  DeleteWorkspaceRequest,
  DeleteWorkspaceResponse
> {
  return async (ctx, tx, req) => {
    // Deleting workspaces requires a user identity
    const currentUserEmail = requireUserEmail(req.identity);

    const now = new Date();

    const workspace = await tx.workspaces.getById({
      id: req.workspaceId,
      currentUserEmail,
    });

    if (!workspace) {
      throw new NotFoundError('Workspace not found');
    }

    // Only admins can delete workspaces
    if (workspace.myRole !== 'admin') {
      throw new ForbiddenError('Only workspace admins can delete the workspace');
    }

    const user = await tx.users.getByEmail(currentUserEmail);
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
