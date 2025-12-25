import assert from 'assert';
import {BadRequestError, ForbiddenError, NotFoundError} from '../errors';
import {requireUserEmail, type Identity} from '../identity';
import {createAuditLogId} from '../stores/audit-log-store';
import type {WorkspaceMemberRole} from '../stores/workspace-member-store';
import type {TransactionalUseCase} from '../use-case';
import type {NormalizedEmail} from '../zod';

export interface AddWorkspaceMemberRequest {
  workspaceId: string;
  identity: Identity;
  memberEmail: string;
  role: WorkspaceMemberRole;
}

export interface AddWorkspaceMemberResponse {
  success: boolean;
}

export function createAddWorkspaceMemberUseCase(): TransactionalUseCase<
  AddWorkspaceMemberRequest,
  AddWorkspaceMemberResponse
> {
  return async (ctx, tx, req) => {
    // This operation requires a user identity
    const currentUserEmail = requireUserEmail(req.identity);

    const now = new Date();

    const workspace = await tx.workspaces.getById({
      id: req.workspaceId,
      currentUserEmail,
    });

    if (!workspace) {
      throw new NotFoundError('Workspace not found');
    }

    // Only admins can add members
    if (workspace.myRole !== 'admin') {
      throw new ForbiddenError('Only workspace admins can add members');
    }

    // Check if member already exists
    const existingMember = await tx.workspaceMembers.getByWorkspaceIdAndEmail({
      workspaceId: req.workspaceId,
      userEmail: req.memberEmail as NormalizedEmail,
    });

    if (existingMember) {
      throw new BadRequestError('User is already a member of this workspace');
    }

    const user = await tx.users.getByEmail(currentUserEmail);
    assert(user, 'Current user not found');

    await tx.workspaceMembers.create([
      {
        workspaceId: req.workspaceId,
        email: req.memberEmail,
        role: req.role,
        createdAt: now,
        updatedAt: now,
      },
    ]);

    await tx.auditLogs.create({
      id: createAuditLogId(),
      createdAt: now,
      projectId: null,
      userId: user.id,
      configId: null,
      payload: {
        type: 'workspace_member_added',
        workspace: {
          id: req.workspaceId,
          name: workspace.name,
        },
        member: {
          email: req.memberEmail,
          role: req.role,
        },
      },
    });

    return {success: true};
  };
}
