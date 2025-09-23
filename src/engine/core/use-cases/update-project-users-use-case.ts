import assert from 'assert';
import {createAuditMessageId} from '../audit-message-store';
import {BadRequestError} from '../errors';
import type {TransactionalUseCase} from '../use-case';
import type {NormalizedEmail} from '../zod';

export interface UpdateProjectUsersRequest {
  projectId: string;
  users: Array<{email: string; role: 'owner' | 'admin'}>;
  currentUserEmail: NormalizedEmail;
}

export interface UpdateProjectUsersResponse {
  ok: true;
}

export function createUpdateProjectUsersUseCase(): TransactionalUseCase<
  UpdateProjectUsersRequest,
  UpdateProjectUsersResponse
> {
  return async (ctx, tx, req) => {
    // Only owners can manage project users
    await tx.permissionService.ensureCanManageProjectUsers(req.projectId, req.currentUserEmail);

    const existing = await tx.projectUsers.getByProjectId(req.projectId);
    const now = new Date();

    const norm = (arr: Array<{email: string; role: 'owner' | 'admin'}>) =>
      arr.map(x => ({email: x.email.toLowerCase(), role: x.role as 'owner' | 'admin'}));

    const next = norm(req.users);
    const prev = existing.map(u => ({
      email: u.user_email_normalized,
      role: u.role as 'owner' | 'admin',
    }));

    if (next.filter(u => u.role === 'owner').length === 0) {
      throw new BadRequestError('At least one owner is required');
    }

    const key = (u: {email: string; role: string}) => `${u.email}@@${u.role}`;
    const prevKeys = new Set(prev.map(key));
    const nextKeys = new Set(next.map(key));

    const added = next.filter(u => !prevKeys.has(key(u)));
    const removed = prev.filter(u => !nextKeys.has(key(u)));

    // Apply changes (remove first to handle role changes cleanly)
    for (const r of removed) {
      await tx.projectUsers.delete(req.projectId, r.email);
    }

    await tx.projectUsers.create(
      added.map(a => ({
        projectId: req.projectId,
        email: a.email,
        role: a.role,
        createdAt: now,
        updatedAt: now,
      })),
    );

    const user = await tx.users.getByEmail(req.currentUserEmail);
    assert(user, 'Current user not found');

    await tx.auditMessages.create({
      id: createAuditMessageId(),
      createdAt: now,
      userId: user.id,
      configId: null,
      projectId: req.projectId,
      payload: {
        type: 'project_members_changed',
        added,
        removed,
      },
    });

    return {ok: true};
  };
}
