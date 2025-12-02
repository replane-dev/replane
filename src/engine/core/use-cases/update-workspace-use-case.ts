import assert from 'assert';
import {ForbiddenError, NotFoundError} from '../errors';
import {createAuditLogId} from '../stores/audit-log-store';
import type {TransactionalUseCase} from '../use-case';
import type {NormalizedEmail} from '../zod';

export interface UpdateWorkspaceRequest {
  workspaceId: string;
  currentUserEmail: NormalizedEmail;
  name: string;
}

export interface UpdateWorkspaceResponse {
  success: boolean;
}

export function createUpdateWorkspaceUseCase(): TransactionalUseCase<
  UpdateWorkspaceRequest,
  UpdateWorkspaceResponse
> {
  return async (ctx, tx, req) => {
    await tx.permissionService.ensureIsWorkspaceAdmin(ctx, {
      workspaceId: req.workspaceId,
      currentUserEmail: req.currentUserEmail,
    });

    const now = new Date();

    const workspace = await tx.workspaces.getById({
      id: req.workspaceId,
      currentUserEmail: req.currentUserEmail,
    });

    if (!workspace) {
      throw new NotFoundError('Workspace not found');
    }

    // Only admins can update workspace settings
    if (workspace.myRole !== 'admin') {
      throw new ForbiddenError('Only workspace admins can update settings');
    }

    const user = await tx.users.getByEmail(req.currentUserEmail);
    assert(user, 'Current user not found');

    await tx.workspaces.updateById({
      id: req.workspaceId,
      name: req.name,
      updatedAt: now,
    });

    await tx.auditLogs.create({
      id: createAuditLogId(),
      createdAt: now,
      projectId: null,
      userId: user.id,
      configId: null,
      payload: {
        type: 'workspace_updated',
        workspace: {
          id: req.workspaceId,
          name: req.name,
        },
        before: {
          name: workspace.name,
        },
        after: {
          name: req.name,
        },
      },
    });

    return {success: true};
  };
}
