import {ConfigService} from '../config-service';
import {type Context} from '../context';
import {getUserIdFromIdentity, isUserIdentity, type Identity} from '../identity';
import {AuditLogStore, createAuditLogId} from '../stores/audit-log-store';
import {ConfigStore} from '../stores/config-store';
import type {ProjectEnvironmentStore} from '../stores/project-environment-store';
import {createProjectId, Project, ProjectStore} from '../stores/project-store';
import type {WorkspaceMemberStore} from '../stores/workspace-member-store';
import {createWorkspaceId, Workspace, WorkspaceStore} from '../stores/workspace-store';
import type {TransactionalUseCase} from '../use-case';
import {createUuidV7} from '../uuid';
import {createExampleConfigs} from './add-example-configs-use-case';

export interface CreateWorkspaceRequest {
  identity: Identity;
  name: string;
}

export interface CreateWorkspaceResponse {
  workspaceId: string;
  projectId: string;
}

export function createCreateWorkspaceUseCase(): TransactionalUseCase<
  CreateWorkspaceRequest,
  CreateWorkspaceResponse
> {
  return async (ctx, tx, req) => {
    await tx.permissionService.ensureCanCreateWorkspace(ctx, {
      identity: req.identity,
    });

    const now = new Date();

    const {workspace, project} = await createWorkspace({
      ctx,
      identity: req.identity,
      name: {type: 'custom', name: req.name},
      workspaceStore: tx.workspaces,
      workspaceMemberStore: tx.workspaceMembers,
      projectStore: tx.projects,
      projectEnvironmentStore: tx.projectEnvironments,
      configs: tx.configs,
      configService: tx.configService,
      auditLogs: tx.auditLogs,
      now,
      exampleProject: false,
    });
    return {workspaceId: workspace.id, projectId: project.id};
  };
}

export async function createWorkspace(params: {
  ctx: Context;
  identity: Identity;
  name: {type: 'personal'} | {type: 'custom'; name: string};
  workspaceStore: WorkspaceStore;
  workspaceMemberStore: WorkspaceMemberStore;
  projectStore: ProjectStore;
  projectEnvironmentStore: ProjectEnvironmentStore;
  auditLogs: AuditLogStore;
  configs: ConfigStore;
  configService: ConfigService;
  now: Date;
  exampleProject: boolean;
}) {
  const {
    ctx,
    identity,
    name,
    workspaceStore,
    workspaceMemberStore,
    projectStore,
    projectEnvironmentStore,
    auditLogs,
    configs,
    configService,
    now,
    exampleProject,
  } = params;

  const workspaceName =
    name.type === 'personal' && isUserIdentity(identity) && identity.user.name
      ? `${identity.user.name}'s Replane`
      : name.type === 'custom'
        ? name.name
        : 'Personal';
  const workspace: Workspace = {
    id: createWorkspaceId(),
    name: workspaceName,
    autoAddNewUsers: false,
    logo: null,
    createdAt: new Date(),
    updatedAt: new Date(),
  };

  await workspaceStore.create(workspace);
  if (isUserIdentity(identity)) {
    await workspaceMemberStore.create([
      {
        workspaceId: workspace.id,
        email: identity.user.email,
        role: 'admin',
        createdAt: new Date(),
        updatedAt: new Date(),
      },
    ]);
  }
  const project: Project = {
    id: createProjectId(),
    name: 'First project',
    description: 'This is your personal project.',
    workspaceId: workspace.id,
    requireProposals: false,
    allowSelfApprovals: false,
    createdAt: new Date(),
    updatedAt: new Date(),
  };
  await projectStore.create(project);
  const productionId = createUuidV7();
  await projectEnvironmentStore.create({
    projectId: project.id,
    name: 'Production',
    order: 1,
    requireProposals: true,
    createdAt: new Date(),
    updatedAt: new Date(),
    id: productionId,
  });
  const developmentId = createUuidV7();
  await projectEnvironmentStore.create({
    projectId: project.id,
    name: 'Development',
    order: 2,
    requireProposals: true,
    createdAt: new Date(),
    updatedAt: new Date(),
    id: developmentId,
  });

  await auditLogs.create({
    id: createAuditLogId(),
    createdAt: now,
    projectId: null,
    userId: getUserIdFromIdentity(identity),
    configId: null,
    payload: {
      type: 'workspace_created',
      workspace: {
        id: workspace.id,
        name: workspaceName,
      },
    },
  });

  if (exampleProject) {
    await createExampleConfigs({
      ctx,
      projectId: project.id,
      configs: configs,
      configService: configService,
      projectEnvironments: projectEnvironmentStore,
      userId: getUserIdFromIdentity(identity),
    });
  }

  return {workspace, project};
}
