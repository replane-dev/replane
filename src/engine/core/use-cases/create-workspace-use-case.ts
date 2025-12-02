import assert from 'assert';
import {AuditLogStore, createAuditLogId} from '../stores/audit-log-store';
import type {WorkspaceMemberStore} from '../stores/workspace-member-store';
import {createWorkspaceId, Workspace, WorkspaceStore} from '../stores/workspace-store';
import type {ProjectEnvironmentStore} from '../stores/project-environment-store';
import {createProjectId, Project, ProjectStore} from '../stores/project-store';
import type {ProjectUserStore} from '../stores/project-user-store';
import type {TransactionalUseCase} from '../use-case';
import type {UserStore} from '../user-store';
import {createUuidV7} from '../uuid';
import type {NormalizedEmail} from '../zod';

export interface CreateWorkspaceRequest {
  currentUserEmail: NormalizedEmail;
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
    const now = new Date();

    const user = await tx.users.getByEmail(req.currentUserEmail);
    assert(user, 'Current user not found');

    const {workspace, project} = await createWorkspace({
      currentUserEmail: req.currentUserEmail,
      name: req.name,
      workspaceStore: tx.workspaces,
      workspaceMemberStore: tx.workspaceMembers,
      projectStore: tx.projects,
      projectUserStore: tx.projectUsers,
      projectEnvironmentStore: tx.projectEnvironments,
      users: tx.users,
      auditLogs: tx.auditLogs,
      now,
    });
    return {workspaceId: workspace.id, projectId: project.id};
  };
}

export async function createWorkspace(params: {
  currentUserEmail: NormalizedEmail;
  name: string;
  workspaceStore: WorkspaceStore;
  workspaceMemberStore: WorkspaceMemberStore;
  projectStore: ProjectStore;
  projectUserStore: ProjectUserStore;
  projectEnvironmentStore: ProjectEnvironmentStore;
  users: UserStore;
  auditLogs: AuditLogStore;
  now: Date;
}) {
  const {
    currentUserEmail,
    name,
    workspaceStore,
    workspaceMemberStore,
    projectStore,
    projectUserStore,
    projectEnvironmentStore,
    auditLogs,
    now,
    users,
  } = params;

  const workspace: Workspace = {
    id: createWorkspaceId(),
    name,
    autoAddNewUsers: false,
    createdAt: new Date(),
    updatedAt: new Date(),
  };

  await workspaceStore.create(workspace);
  await workspaceMemberStore.create([
    {
      workspaceId: workspace.id,
      email: currentUserEmail,
      role: 'admin',
      createdAt: new Date(),
      updatedAt: new Date(),
    },
  ]);
  const project: Project = {
    id: createProjectId(),
    name: 'First project',
    description: 'This is your personal project.',
    workspaceId: workspace.id,
    requireProposals: false,
    allowSelfApprovals: false,
    createdAt: new Date(),
    updatedAt: new Date(),
    isExample: false,
  };
  await projectStore.create(project);
  await projectUserStore.create([
    {
      projectId: project.id,
      email: currentUserEmail,
      role: 'admin',
      createdAt: new Date(),
      updatedAt: new Date(),
    },
  ]);
  await projectEnvironmentStore.create({
    projectId: project.id,
    name: 'Production',
    order: 1,
    createdAt: new Date(),
    updatedAt: new Date(),
    id: createUuidV7(),
  });
  await projectEnvironmentStore.create({
    projectId: project.id,
    name: 'Development',
    order: 2,
    createdAt: new Date(),
    updatedAt: new Date(),
    id: createUuidV7(),
  });

  const currentUser = await users.getByEmail(currentUserEmail);
  assert(currentUser, 'Current user not found');

  await auditLogs.create({
    id: createAuditLogId(),
    createdAt: now,
    projectId: null,
    userId: currentUser.id,
    configId: null,
    payload: {
      type: 'workspace_created',
      workspace: {
        id: workspace.id,
        name: name,
      },
    },
  });

  return {workspace, project};
}
