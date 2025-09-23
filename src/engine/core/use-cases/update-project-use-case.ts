import assert from 'assert';
import {createAuditMessageId} from '../audit-message-store';
import {BadRequestError, ForbiddenError} from '../errors';
import type {TransactionalUseCase} from '../use-case';
import type {NormalizedEmail} from '../zod';

export interface UpdateProjectRequest {
  id: string;
  name: string;
  description: string;
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
    const existing = await tx.projects.getById({
      currentUserEmail: req.currentUserEmail,
      id: req.id,
    });
    if (!existing) throw new BadRequestError('Project not found');

    // Only owner or admin can manage project
    const canManage = await tx.permissionService.canManageProject(req.id, req.currentUserEmail);
    if (!canManage) throw new ForbiddenError('You are not allowed to manage this project');

    // name uniqueness
    if (req.name !== existing.name) {
      const byName = await tx.projects.getByName(req.name);
      if (byName) throw new BadRequestError('Project with this name already exists');
    }

    const now = new Date();
    await tx.projects.updateById({
      id: req.id,
      name: req.name,
      description: req.description,
      updatedAt: now,
    });

    const user = await tx.users.getByEmail(req.currentUserEmail);
    assert(user, 'Current user not found');

    await tx.auditMessages.create({
      id: createAuditMessageId(),
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
          createdAt: existing.createdAt,
          updatedAt: existing.updatedAt,
        },
        after: {
          id: existing.id,
          name: req.name,
          description: req.description,
          createdAt: existing.createdAt,
          updatedAt: now,
        },
      },
    });

    return {ok: true};
  };
}
