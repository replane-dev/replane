import type {Context} from './context';
import type {Identity} from './identity';
import type {PermissionService} from './permission-service';
import type {ProjectEnvironmentStore} from './stores/project-environment-store';
import type {ProjectStore} from './stores/project-store';
import type {ProjectUserStore} from './stores/project-user-store';
import type {NormalizedEmail} from './zod';

export interface ProjectDetails {
  id: string;
  name: string;
  description: string;
  workspaceId: string;
  requireProposals: boolean;
  allowSelfApprovals: boolean;
  createdAt: Date;
  updatedAt: Date;
  myRole: 'admin' | 'maintainer' | null;
}

export interface ProjectEnvironment {
  id: string;
  name: string;
  order: number;
  requireProposals: boolean;
}

export interface ProjectListItem {
  id: string;
  name: string;
  descriptionPreview: string;
  createdAt: Date;
  updatedAt: Date;
  workspaceId: string;
  requireProposals: boolean;
  allowSelfApprovals: boolean;
  myRole?: 'admin' | 'maintainer';
}

export interface ProjectUser {
  email: string;
  role: 'admin' | 'maintainer';
}

export class ProjectQueryService {
  constructor(
    private projects: ProjectStore,
    private projectEnvironments: ProjectEnvironmentStore,
    private projectUsers: ProjectUserStore,
    private permissionService: PermissionService,
  ) {}

  async getProject(
    ctx: Context,
    opts: {id: string; identity: Identity},
  ): Promise<ProjectDetails | null> {
    const project = await this.projects.getByIdWithoutPermissionCheck(opts.id);
    if (!project) return null;

    // Get user's effective project role (combines explicit role + workspace admin status)
    const myRole = await this.permissionService.inferUserProjectRole(ctx, {
      projectId: opts.id,
      identity: opts.identity,
    });

    return {
      id: project.id,
      name: project.name,
      description: project.description,
      workspaceId: project.workspaceId,
      requireProposals: project.requireProposals,
      allowSelfApprovals: project.allowSelfApprovals,
      createdAt: project.createdAt,
      updatedAt: project.updatedAt,
      myRole: myRole === 'viewer' || myRole === 'editor' ? null : myRole,
    };
  }

  async getEnvironments(opts: {projectId: string}): Promise<ProjectEnvironment[]> {
    const environments = await this.projectEnvironments.getByProjectId(opts.projectId);
    return environments.map(env => ({
      id: env.id,
      name: env.name,
      order: env.order,
      requireProposals: env.requireProposals,
    }));
  }

  async getProjectList(opts: {currentUserEmail: NormalizedEmail}): Promise<ProjectListItem[]> {
    const list = await this.projects.getUserProjects({currentUserEmail: opts.currentUserEmail});
    return list.map(p => ({
      id: p.id,
      name: p.name,
      descriptionPreview: p.descriptionPreview,
      createdAt: p.createdAt,
      updatedAt: p.updatedAt,
      workspaceId: p.workspaceId,
      requireProposals: p.requireProposals,
      allowSelfApprovals: p.allowSelfApprovals,
      myRole: p.myRole,
    }));
  }

  async getProjectUsers(opts: {projectId: string}): Promise<ProjectUser[]> {
    const users = await this.projectUsers.getByProjectId(opts.projectId);
    return users.map(u => ({
      email: u.user_email_normalized,
      role: u.role,
    }));
  }
}
