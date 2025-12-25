import {BadRequestError} from '../errors';
import {getUserIdFromIdentity, type Identity} from '../identity';
import {createAuditLogId} from '../stores/audit-log-store';
import type {TransactionalUseCase} from '../use-case';

export interface DeleteProjectRequest {
  id: string;
  confirmName: string | null;
  identity: Identity;
}

export interface DeleteProjectResponse {}

export interface DeleteProjectUseCaseDeps {}

export function createDeleteProjectUseCase(
  deps: DeleteProjectUseCaseDeps,
): TransactionalUseCase<DeleteProjectRequest, DeleteProjectResponse> {
  return async (ctx, tx, req) => {
    const project = await tx.projects.getByIdWithoutPermissionCheck(req.id);
    if (!project) throw new BadRequestError('Project not found');

    // confirm project name
    if (project.name !== (req.confirmName ?? project.name)) {
      throw new BadRequestError('Project name confirmation does not match');
    }

    // Only owners/admins can delete a project
    await tx.permissionService.ensureCanDeleteProject(ctx, {
      projectId: project.id,
      identity: req.identity,
    });

    // Prevent deleting the last remaining project within the workspace
    const totalInWorkspace = await tx.projects.countByWorkspace(project.workspaceId);
    if (totalInWorkspace <= 1) {
      throw new BadRequestError('Cannot delete the last remaining project in this workspace');
    }

    await tx.projects.deleteById(project.id);

    await tx.auditLogs.create({
      id: createAuditLogId(),
      createdAt: new Date(),
      userId: getUserIdFromIdentity(req.identity),
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
