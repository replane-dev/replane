import type {Identity} from '../identity';
import type {WorkspaceMemberRole} from '../stores/workspace-member-store';
import type {TransactionalUseCase} from '../use-case';

export interface GetWorkspaceMembersRequest {
  workspaceId: string;
  identity: Identity;
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
      identity: req.identity,
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
