import assert from 'assert';
import {BadRequestError, ForbiddenError, NotFoundError} from '../errors';
import {createAuditLogId} from '../stores/audit-log-store';
import type {TransactionalUseCase} from '../use-case';
import {normalizeEmail} from '../utils';
import type {NormalizedEmail} from '../zod';

export interface RemoveWorkspaceMemberRequest {
  workspaceId: string;
  currentUserEmail: NormalizedEmail;
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

    // Only admins can remove members
    if (workspace.myRole !== 'admin') {
      throw new ForbiddenError('Only workspace admins can remove members');
    }

    // Prevent removing members from personal workspaces
    if (workspace.personalWorkspaceUserId) {
      throw new BadRequestError(
        'Cannot remove members from personal workspace. Personal workspaces can only have one member.',
      );
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

    const user = await tx.users.getByEmail(req.currentUserEmail);
    assert(user, 'Current user not found');

    await tx.workspaceMembers.delete(req.workspaceId, req.memberEmail);
    await tx.projectUsers.deleteUserFromWorkspaceProjects({
      workspaceId: req.workspaceId,
      userEmail: normalizeEmail(req.memberEmail),
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
