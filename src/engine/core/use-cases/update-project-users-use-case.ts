import assert from 'assert';
import {BadRequestError} from '../errors';
import {requireUserEmail, type Identity} from '../identity';
import {createAuditLogId} from '../stores/audit-log-store';
import type {TransactionalUseCase} from '../use-case';
import {normalizeEmail} from '../utils';

export interface UpdateProjectUsersRequest {
  projectId: string;
  users: Array<{email: string; role: 'admin' | 'maintainer'}>;
  identity: Identity;
}

export interface UpdateProjectUsersResponse {
  ok: true;
}

export function createUpdateProjectUsersUseCase(): TransactionalUseCase<
  UpdateProjectUsersRequest,
  UpdateProjectUsersResponse
> {
  return async (ctx, tx, req) => {
    // This operation requires a user identity
    const currentUserEmail = requireUserEmail(req.identity);

    await tx.permissionService.ensureCanManageProjectUsers(ctx, {
      projectId: req.projectId,
      identity: req.identity,
    });

    const existing = await tx.projectUsers.getByProjectId(req.projectId);
    const now = new Date();

    const norm = (arr: Array<{email: string; role: 'admin' | 'maintainer'}>) =>
      arr.map(x => ({email: x.email.toLowerCase(), role: x.role as 'admin' | 'maintainer'}));

    const next = norm(req.users);
    const prev = existing.map(u => ({
      email: u.user_email_normalized,
      role: u.role as 'admin' | 'maintainer',
    }));

    if (next.filter(u => u.role === 'admin').length === 0) {
      throw new BadRequestError('At least one admin is required');
    }

    const key = (u: {email: string; role: string}) => `${u.email}@@${u.role}`;
    const prevKeys = new Set(prev.map(key));
    const nextKeys = new Set(next.map(key));

    const added = next.filter(u => !prevKeys.has(key(u)));
    const removed = prev.filter(u => !nextKeys.has(key(u)));

    // Apply changes (remove first to handle role changes cleanly)
    for (const r of removed) {
      await tx.projectUsers.delete({projectId: req.projectId, userEmail: normalizeEmail(r.email)});
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

    const user = await tx.users.getByEmail(currentUserEmail);
    assert(user, 'Current user not found');

    await tx.auditLogs.create({
      id: createAuditLogId(),
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
