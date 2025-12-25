import assert from 'assert';
import {BadRequestError, ForbiddenError, NotFoundError} from '../errors';
import {requireUserEmail, type Identity} from '../identity';
import {createAuditLogId} from '../stores/audit-log-store';
import type {TransactionalUseCase} from '../use-case';
import {normalizeEmail} from '../utils';
import type {NormalizedEmail} from '../zod';

export interface RemoveWorkspaceMemberRequest {
  workspaceId: string;
  identity: Identity;
  memberEmail: string;
}

export interface RemoveWorkspaceMemberResponse {
  success: boolean;
}

export function createRemoveWorkspaceMemberUseCase(): TransactionalUseCase<
  RemoveWorkspaceMemberRequest,
  RemoveWorkspaceMemberResponse
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

    // Only admins can remove members
    if (workspace.myRole !== 'admin') {
      throw new ForbiddenError('Only workspace admins can remove members');
    }

    // Check if member exists
    const existingMember = await tx.workspaceMembers.getByWorkspaceIdAndEmail({
      workspaceId: req.workspaceId,
      userEmail: req.memberEmail as NormalizedEmail,
    });

    if (!existingMember) {
      throw new NotFoundError('User is not a member of this workspace');
    }

    // Prevent removing the last admin
    const members = await tx.workspaceMembers.getByWorkspaceId(req.workspaceId);
    const adminCount = members.filter(m => m.role === 'admin').length;

    if (existingMember.role === 'admin' && adminCount <= 1) {
      throw new BadRequestError('Cannot remove the last admin from the workspace');
    }

    const user = await tx.users.getByEmail(currentUserEmail);
    assert(user, 'Current user not found');

    // Remove member from workspace and all its projects
    await tx.workspaceMemberService.removeMemberFromWorkspace({
      workspaceId: req.workspaceId,
      memberEmail: normalizeEmail(req.memberEmail),
    });

    await tx.auditLogs.create({
      id: createAuditLogId(),
      createdAt: now,
      projectId: null,
      userId: user.id,
      configId: null,
      payload: {
        type: 'workspace_member_removed',
        workspace: {
          id: req.workspaceId,
          name: workspace.name,
        },
        member: {
          email: req.memberEmail,
          role: existingMember.role,
        },
      },
    });

    return {success: true};
  };
}
