import assert from 'assert';
import {createAuditMessageId} from '../audit-message-store';
import {BadRequestError} from '../errors';
import {diffMembers} from '../member-diff';
import type {UseCase} from '../use-case';
import type {NormalizedEmail} from '../zod';

export interface PatchProjectRequest {
  id: string;
  currentUserEmail: NormalizedEmail;
  details?: {
    name: string;
    description: string;
  };
  members?: {
    users: Array<{email: string; role: 'owner' | 'admin'}>;
  };
}

export interface PatchProjectResponse {}

export function createPatchProjectUseCase(): UseCase<PatchProjectRequest, PatchProjectResponse> {
  return async (ctx, tx, req) => {
    const existing = await tx.projects.getById(req.id);
    if (!existing) throw new BadRequestError('Project not found');

    const now = new Date();
    const user = await tx.users.getByEmail(req.currentUserEmail);
    assert(user, 'Current user not found');

    // Patch details
    if (req.details) {
      const canManage = await tx.permissionService.canManageProject(req.id, req.currentUserEmail);
      if (!canManage) throw new BadRequestError('You are not allowed to manage this project');

      const {name, description} = req.details;
      if (name !== existing.name) {
        const same = await tx.projects.getByName(name);
        if (same) throw new BadRequestError('Project with this name already exists');
      }

      await tx.projects.updateById({id: req.id, name, description, updatedAt: now});

      await tx.auditMessages.create({
        id: createAuditMessageId(),
        createdAt: now,
        userId: user.id,
        projectId: existing.id,
        configId: null,
        payload: {
          type: 'project_updated',
          before: {
            id: existing.id,
            name: existing.name,
            description: existing.description,
            createdAt: existing.createdAt,
            updatedAt: existing.updatedAt,
          },
          after: {
            id: existing.id,
            name,
            description,
            createdAt: existing.createdAt,
            updatedAt: now,
          },
        },
      });
    }

    // Patch members
    if (req.members) {
      await tx.permissionService.ensureCanManageProjectUsers(req.id, req.currentUserEmail);

      const prevUsers = await tx.projectUsers.getByProjectId(req.id);
      const prev = prevUsers.map(u => ({email: u.user_email_normalized, role: u.role as any}));
      const next = req.members.users.map(u => ({email: u.email.toLowerCase(), role: u.role}));

      if (next.filter(u => u.role === 'owner').length === 0) {
        throw new BadRequestError('At least one owner is required');
      }

      const {added, removed} = diffMembers(prev, next);

      for (const r of removed) {
        await tx.projectUsers.delete(req.id, r.email);
      }
      await tx.projectUsers.create(
        added.map(a => ({
          projectId: req.id,
          email: a.email,
          role: a.role,
          createdAt: now,
          updatedAt: now,
        })),
      );

      if (added.length + removed.length > 0) {
        await tx.auditMessages.create({
          id: createAuditMessageId(),
          createdAt: now,
          userId: user.id,
          configId: null,
          projectId: req.id,
          payload: {
            type: 'project_members_changed',
            added,
            removed,
          } as any,
        });
      }
    }

    return {};
  };
}
