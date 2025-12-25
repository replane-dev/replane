import {BadRequestError} from '../errors';
import {getUserIdFromIdentity, type Identity} from '../identity';
import {diffMembers} from '../member-diff';
import {createAuditLogId} from '../stores/audit-log-store';
import type {ProjectUserRole} from '../stores/project-user-store';
import type {TransactionalUseCase} from '../use-case';
import {normalizeEmail} from '../utils';

export interface PatchProjectRequest {
  id: string;
  identity: Identity;
  details?: {
    name?: string;
    description?: string;
    requireProposals?: boolean;
    allowSelfApprovals?: boolean;
  };
  members?: {
    users: Array<{email: string; role: ProjectUserRole}>;
  };
}

export interface PatchProjectResponse {}

export function createPatchProjectUseCase(): TransactionalUseCase<
  PatchProjectRequest,
  PatchProjectResponse
> {
  return async (ctx, tx, req) => {
    // Check permission to manage this project (includes scope check for API keys)
    await tx.permissionService.ensureCanManageProject(ctx, {
      projectId: req.id,
      identity: req.identity,
    });

    const existing = await tx.projects.getByIdWithoutPermissionCheck(req.id);
    if (!existing) throw new BadRequestError('Project not found');

    const now = new Date();

    // Patch details
    if (req.details) {
      const {name, description, requireProposals, allowSelfApprovals} = req.details;

      // Use existing values if not provided
      const newName = name ?? existing.name;
      const newDescription = description ?? existing.description;
      const newRequireProposals = requireProposals ?? existing.requireProposals;
      const newAllowSelfApprovals = allowSelfApprovals ?? existing.allowSelfApprovals;

      // Check for duplicate name if name is being changed
      if (newName !== existing.name) {
        const same = await tx.projects.getByName({
          name: newName,
          workspaceId: existing.workspaceId,
        });
        if (same) throw new BadRequestError('Project with this name already exists');
      }

      await tx.projects.updateById({
        id: req.id,
        name: newName,
        description: newDescription,
        requireProposals: newRequireProposals,
        allowSelfApprovals: newAllowSelfApprovals,
        updatedAt: now,
      });

      await tx.auditLogs.create({
        id: createAuditLogId(),
        createdAt: now,
        userId: getUserIdFromIdentity(req.identity),
        projectId: existing.id,
        configId: null,
        payload: {
          type: 'project_updated',
          before: {
            id: existing.id,
            name: existing.name,
            description: existing.description,
            requireProposals: existing.requireProposals,
            allowSelfApprovals: existing.allowSelfApprovals,
            createdAt: existing.createdAt,
            updatedAt: existing.updatedAt,
          },
          after: {
            id: existing.id,
            name: newName,
            description: newDescription,
            requireProposals: newRequireProposals,
            allowSelfApprovals: newAllowSelfApprovals,
            createdAt: existing.createdAt,
            updatedAt: now,
          },
        },
      });
    }

    // Patch members
    if (req.members) {
      await tx.permissionService.ensureCanManageProjectUsers(ctx, {
        projectId: req.id,
        identity: req.identity,
      });

      const prevUsers = await tx.projectUsers.getByProjectId(req.id);
      const prev = prevUsers.map(u => ({email: u.user_email_normalized, role: u.role}));
      const next = req.members.users.map(u => ({email: u.email.toLowerCase(), role: u.role}));

      if (next.filter(u => u.role === 'admin').length === 0) {
        throw new BadRequestError('At least one maintainer is required');
      }

      const {added, removed} = diffMembers(prev, next);

      for (const r of removed) {
        await tx.projectUsers.delete({projectId: req.id, userEmail: normalizeEmail(r.email)});
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
        await tx.auditLogs.create({
          id: createAuditLogId(),
          createdAt: now,
          userId: getUserIdFromIdentity(req.identity),
          configId: null,
          projectId: req.id,
          payload: {
            type: 'project_members_changed',
            added,
            removed,
          },
        });
      }
    }

    return {};
  };
}
