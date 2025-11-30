import assert from 'assert';
import {BadRequestError} from '../errors';
import {createAuditLogId} from '../stores/audit-log-store';
import type {TransactionalUseCase} from '../use-case';
import type {NormalizedEmail} from '../zod';

export interface DeleteProjectRequest {
  id: string;
  confirmName: string;
  currentUserEmail: NormalizedEmail;
}

export interface DeleteProjectResponse {}

export interface DeleteProjectUseCaseDeps {}

export function createDeleteProjectUseCase(
  deps: DeleteProjectUseCaseDeps,
): TransactionalUseCase<DeleteProjectRequest, DeleteProjectResponse> {
  return async (ctx, tx, req) => {
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
    await tx.permissionService.ensureCanDeleteProject(ctx, {
      projectId: project.id,
      currentUserEmail: req.currentUserEmail,
    });

    // Prevent deleting the last remaining project within the organization
    const totalInOrg = await tx.projects.countByOrganization(project.organizationId);
    if (totalInOrg <= 1) {
      throw new BadRequestError('Cannot delete the last remaining project in this organization');
    }

    // Capture data for audit before deletion
    const currentUser = await tx.users.getByEmail(req.currentUserEmail);
    assert(currentUser, 'Current user not found');

    await tx.projects.deleteById(project.id);

    await tx.auditLogs.create({
      id: createAuditLogId(),
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
