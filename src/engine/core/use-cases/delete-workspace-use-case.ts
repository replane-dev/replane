import {NotFoundError} from '../errors';
import {getUserIdFromIdentity, type Identity} from '../identity';
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
    await tx.permissionService.ensureIsWorkspaceAdmin(ctx, {
      workspaceId: req.workspaceId,
      identity: req.identity,
    });

    const now = new Date();

    const workspace = await tx.workspaces.getByIdSimple(req.workspaceId);

    if (!workspace) {
      throw new NotFoundError('Workspace not found');
    }

    await tx.auditLogs.create({
      id: createAuditLogId(),
      createdAt: now,
      projectId: null,
      userId: getUserIdFromIdentity(req.identity),
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
