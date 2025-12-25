import assert from 'assert';
import {BadRequestError, ForbiddenError, NotFoundError} from '../errors';
import {requireUserEmail, type Identity} from '../identity';
import {createAuditLogId} from '../stores/audit-log-store';
import type {WorkspaceMemberRole} from '../stores/workspace-member-store';
import type {TransactionalUseCase} from '../use-case';
import type {NormalizedEmail} from '../zod';

export interface UpdateWorkspaceMemberRoleRequest {
  workspaceId: string;
  identity: Identity;
  memberEmail: string;
  role: WorkspaceMemberRole;
}

export interface UpdateWorkspaceMemberRoleResponse {
  success: boolean;
}

export function createUpdateWorkspaceMemberRoleUseCase(): TransactionalUseCase<
  UpdateWorkspaceMemberRoleRequest,
  UpdateWorkspaceMemberRoleResponse
> {
  return async (ctx, tx, req) => {
    // This operation requires a user identity
    const currentUserEmail = requireUserEmail(req.identity);

    await tx.permissionService.ensureIsWorkspaceAdmin(ctx, {
      workspaceId: req.workspaceId,
      identity: req.identity,
    });

    const now = new Date();

    const workspace = await tx.workspaces.getById({
      id: req.workspaceId,
      currentUserEmail,
    });

    if (!workspace) {
      throw new NotFoundError('Workspace not found');
    }

    // Only admins can update member roles
    if (workspace.myRole !== 'admin') {
      throw new ForbiddenError('Only workspace admins can update member roles');
    }

    // Check if member exists
    const existingMember = await tx.workspaceMembers.getByWorkspaceIdAndEmail({
      workspaceId: req.workspaceId,
      userEmail: req.memberEmail as NormalizedEmail,
    });

    if (!existingMember) {
      throw new NotFoundError('User is not a member of this workspace');
    }

    // Prevent demoting the last admin
    if (existingMember.role === 'admin' && req.role !== 'admin') {
      const members = await tx.workspaceMembers.getByWorkspaceId(req.workspaceId);
      const adminCount = members.filter(m => m.role === 'admin').length;

      if (adminCount <= 1) {
        throw new BadRequestError('Cannot demote the last admin of the workspace');
      }
    }

    const user = await tx.users.getByEmail(currentUserEmail);
    assert(user, 'Current user not found');

    await tx.workspaceMembers.updateRole({
      workspaceId: req.workspaceId,
      userEmail: req.memberEmail,
      role: req.role,
      updatedAt: now,
    });

    await tx.auditLogs.create({
      id: createAuditLogId(),
      createdAt: now,
      projectId: null,
      userId: user.id,
      configId: null,
      payload: {
        type: 'workspace_member_role_changed',
        workspace: {
          id: req.workspaceId,
          name: workspace.name,
        },
        member: {
          email: req.memberEmail,
        },
        before: {
          role: existingMember.role,
        },
        after: {
          role: req.role,
        },
      },
    });

    return {success: true};
  };
}
