import assert from 'assert';
import {createAuditMessageId} from '../audit-message-store';
import {BadRequestError} from '../errors';
import {createProjectId} from '../project-store';
import type {TransactionalUseCase} from '../use-case';
import type {NormalizedEmail} from '../zod';

export interface CreateProjectRequest {
  currentUserEmail: NormalizedEmail;
  name: string;
  description: string;
}

export interface CreateProjectResponse {
  projectId: string;
}

export function createCreateProjectUseCase(): TransactionalUseCase<
  CreateProjectRequest,
  CreateProjectResponse
> {
  return async (ctx, tx, req) => {
    const now = new Date();

    const existing = await tx.projects.getByName(req.name);
    if (existing) throw new BadRequestError('Project with this name already exists');

    const user = await tx.users.getByEmail(req.currentUserEmail);
    assert(user, 'Current user not found');

    const projectId = createProjectId();

    await tx.projects.create({
      id: projectId,
      name: req.name,
      description: req.description,
      createdAt: now,
      updatedAt: now,
      isExample: false,
    });

    await tx.projectUsers.create([
      {
        projectId,
        email: req.currentUserEmail,
        role: 'admin',
        createdAt: now,
        updatedAt: now,
      },
    ]);

    await tx.auditMessages.create({
      id: createAuditMessageId(),
      createdAt: now,
      projectId,
      userId: user.id,
      configId: null,
      payload: {
        type: 'project_created',
        project: {id: projectId, name: req.name, description: req.description, createdAt: now},
      },
    });

    return {projectId};
  };
}
