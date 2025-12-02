import type {WorkspaceMemberRole} from '../stores/workspace-member-store';
import type {TransactionalUseCase} from '../use-case';
import type {NormalizedEmail} from '../zod';

export interface GetWorkspaceMembersRequest {
  workspaceId: string;
  currentUserEmail: NormalizedEmail;
}

export interface WorkspaceMember {
  email: string;
  role: WorkspaceMemberRole;
  createdAt: Date;
  updatedAt: Date;
}

export type GetWorkspaceMembersResponse = WorkspaceMember[];

export function createGetWorkspaceMembersUseCase(): TransactionalUseCase<
  GetWorkspaceMembersRequest,
  GetWorkspaceMembersResponse
> {
  return async (ctx, tx, req) => {
    await tx.permissionService.ensureIsWorkspaceMember(ctx, {
      workspaceId: req.workspaceId,
      currentUserEmail: req.currentUserEmail,
    });

    const members = await tx.workspaceMembers.getByWorkspaceId(req.workspaceId);

    return members.map(m => ({
      email: m.user_email_normalized,
      role: m.role,
      createdAt: m.created_at,
      updatedAt: m.updated_at,
    }));
  };
}
