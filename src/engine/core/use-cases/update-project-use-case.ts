import assert from 'assert';
import {createAuditLogId} from '../audit-log-store';
import {BadRequestError} from '../errors';
import type {TransactionalUseCase} from '../use-case';
import type {NormalizedEmail} from '../zod';

export interface UpdateProjectRequest {
  id: string;
  name: string;
  description: string;
  requireProposals: boolean;
  allowSelfApprovals: boolean;
  currentUserEmail: NormalizedEmail;
}

export interface UpdateProjectResponse {
  ok: true;
}

export function createUpdateProjectUseCase(): TransactionalUseCase<
  UpdateProjectRequest,
  UpdateProjectResponse
> {
  return async (ctx, tx, req) => {
    await tx.permissionService.ensureCanManageProject(ctx, {
      projectId: req.id,
      currentUserEmail: req.currentUserEmail,
    });

    const existing = await tx.projects.getById({
      currentUserEmail: req.currentUserEmail,
      id: req.id,
    });
    if (!existing) throw new BadRequestError('Project not found');

    if (req.name !== existing.name) {
      const byName = await tx.projects.getByName(req.name);
      if (byName) throw new BadRequestError('Project with this name already exists');
    }

    const now = new Date();
    await tx.projects.updateById({
      id: req.id,
      name: req.name,
      description: req.description,
      requireProposals: req.requireProposals,
      allowSelfApprovals: req.allowSelfApprovals,
      updatedAt: now,
    });

    const user = await tx.users.getByEmail(req.currentUserEmail);
    assert(user, 'Current user not found');

    await tx.auditLogs.create({
      id: createAuditLogId(),
      createdAt: now,
      projectId: existing.id,
      userId: user.id,
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
          name: req.name,
          description: req.description,
          requireProposals: req.requireProposals,
          allowSelfApprovals: req.allowSelfApprovals,
          createdAt: existing.createdAt,
          updatedAt: now,
        },
      },
    });

    return {ok: true};
  };
}
