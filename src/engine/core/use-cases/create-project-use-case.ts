import {BadRequestError} from '../errors';
import {getAuditIdentityInfo, type Identity} from '../identity';
import {createAuditLogId} from '../stores/audit-log-store';
import type {ProjectEnvironment} from '../stores/project-environment-store';
import {createProjectId} from '../stores/project-store';
import type {TransactionalUseCase} from '../use-case';
import {createUuidV7} from '../uuid';

export interface CreateProjectRequest {
  identity: Identity;
  workspaceId: string;
  name: string;
  description: string;
  requireProposals?: boolean;
  allowSelfApprovals?: boolean;
}

export interface CreateProjectResponse {
  projectId: string;
  environments: Array<{
    id: string;
    name: string;
  }>;
}

export function createCreateProjectUseCase(): TransactionalUseCase<
  CreateProjectRequest,
  CreateProjectResponse
> {
  return async (ctx, tx, req) => {
    const auditInfo = getAuditIdentityInfo(req.identity);

    const now = new Date();

    const existing = await tx.projects.getByName({
      name: req.name,
      workspaceId: req.workspaceId,
    });
    if (existing) throw new BadRequestError('Project with this name already exists');

    // Check permission to create projects in this workspace
    await tx.permissionService.ensureCanCreateProject(ctx, {
      workspaceId: req.workspaceId,
      identity: req.identity,
    });

    // Get user ID for audit log (null for API key)
    let userId: number | null = null;
    if (auditInfo.userEmail) {
      const user = await tx.users.getByEmail(auditInfo.userEmail);
      if (!user) {
        throw new BadRequestError('User not found');
      }
      userId = user.id;
    }

    const projectId = createProjectId();

    await tx.projects.create({
      id: projectId,
      name: req.name,
      description: req.description,
      workspaceId: req.workspaceId,
      requireProposals: req.requireProposals ?? false,
      allowSelfApprovals: req.allowSelfApprovals ?? false,
      createdAt: now,
      updatedAt: now,
    });

    const production: ProjectEnvironment = {
      id: createUuidV7(),
      projectId,
      name: 'Production',
      order: 1,
      requireProposals: true,
      createdAt: now,
      updatedAt: now,
    };

    const dev: ProjectEnvironment = {
      id: createUuidV7(),
      projectId,
      name: 'Development',
      order: 2,
      requireProposals: true,
      createdAt: now,
      updatedAt: now,
    };

    await tx.projectEnvironments.create(production);

    await tx.projectEnvironments.create(dev);

    await tx.auditLogs.create({
      id: createAuditLogId(),
      createdAt: now,
      projectId,
      userId,
      configId: null,
      payload: {
        type: 'project_created',
        project: {id: projectId, name: req.name, description: req.description, createdAt: now},
      },
    });

    // Add user as project admin (only for user identities)
    if (auditInfo.userEmail) {
      await tx.projectUsers.create([
        {
          projectId,
          email: auditInfo.userEmail,
          role: 'admin',
          createdAt: now,
          updatedAt: now,
        },
      ]);
    }

    return {projectId, environments: [production, dev].map(e => ({id: e.id, name: e.name}))};
  };
}
