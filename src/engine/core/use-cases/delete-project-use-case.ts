import assert from 'assert';
import {createAuditMessageId} from '../audit-message-store';
import {BadRequestError} from '../errors';
import type {UseCase} from '../use-case';
import type {NormalizedEmail} from '../zod';

export interface DeleteProjectRequest {
  id: string;
  confirmName: string;
  currentUserEmail: NormalizedEmail;
}

export interface DeleteProjectResponse {}

export function createDeleteProjectUseCase(): UseCase<DeleteProjectRequest, DeleteProjectResponse> {
  return async (_ctx, tx, req) => {
    const project = await tx.projects.getById({
      id: req.id,
      currentUserEmail: req.currentUserEmail,
    });
    if (!project) throw new BadRequestError('Project not found');

    // confirm project name
    if (project.name !== req.confirmName) {
      throw new BadRequestError('Project name confirmation does not match');
    }

    // Only owners/admins can delete a project
    await tx.permissionService.ensureCanDeleteProject(project.id, req.currentUserEmail);

    // Prevent deleting the last remaining project to keep the app routable
    const total = await tx.projects.countAll();
    if (total <= 1) {
      throw new BadRequestError('Cannot delete the last remaining project');
    }

    // Capture data for audit before deletion
    const currentUser = await tx.users.getByEmail(req.currentUserEmail);
    assert(currentUser, 'Current user not found');

    await tx.projects.deleteById(project.id);

    await tx.auditMessages.create({
      id: createAuditMessageId(),
      createdAt: new Date(),
      userId: currentUser.id,
      configId: null,
      projectId: null,
      payload: {
        type: 'project_deleted',
        project: {
          id: project.id,
          name: project.name,
          description: project.description,
          createdAt: project.createdAt,
          updatedAt: project.updatedAt,
        },
      },
    });

    return {};
  };
}
