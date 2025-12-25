import type {ConfigService} from './config-service';
import type {Context} from './context';
import {ForbiddenError} from './errors';
import type {Identity} from './identity';
import type {AuditLogStore} from './stores/audit-log-store';
import type {ConfigStore} from './stores/config-store';
import type {ProjectEnvironmentStore} from './stores/project-environment-store';
import type {ProjectStore} from './stores/project-store';
import type {ProjectUserStore} from './stores/project-user-store';
import type {WorkspaceMemberStore} from './stores/workspace-member-store';
import type {WorkspaceStore} from './stores/workspace-store';
import {type WorkspaceInfo} from './stores/workspace-store';
import {createWorkspace} from './use-cases/create-workspace-use-case';

export type WorkspaceListItem = WorkspaceInfo;

export class WorkspaceService {
  constructor(
    private workspaces: WorkspaceStore,
    private workspaceMembers: WorkspaceMemberStore,
    private projects: ProjectStore,
    private projectUsers: ProjectUserStore,
    private projectEnvironments: ProjectEnvironmentStore,
    private configs: ConfigStore,
    private configService: ConfigService,
    private auditLogs: AuditLogStore,
  ) {}

  async getOrCreateUserWorkspaces(opts: {
    ctx: Context;
    identity: Identity;
  }): Promise<WorkspaceListItem[]> {
    // This operation requires a user identity
    if (opts.identity.type !== 'user') {
      throw new Error('API keys cannot create workspaces');
    }
    const currentUserEmail = opts.identity.user.email;

    const workspaces = await this.workspaces.getAllTheUserMemberOf({
      currentUserEmail,
    });

    if (workspaces.length === 0) {
      await createWorkspace({
        ctx: opts.ctx,
        identity: opts.identity,
        name: {type: 'personal'},
        workspaceStore: this.workspaces,
        workspaceMemberStore: this.workspaceMembers,
        projectStore: this.projects,
        projectUserStore: this.projectUsers,
        projectEnvironmentStore: this.projectEnvironments,
        configs: this.configs,
        configService: this.configService,
        auditLogs: this.auditLogs,
        now: new Date(),
        exampleProject: true,
      });
    }

    return this.workspaces.getAllTheUserMemberOf({currentUserEmail});
  }

  /**
   * Get all workspaces in the system (for superuser access).
   */
  async getAllWorkspaces(identity: Identity): Promise<WorkspaceListItem[]> {
    if (identity.type !== 'superuser') {
      throw new ForbiddenError('Only superusers can get all workspaces');
    }

    const workspaces = await this.workspaces.getAll();
    // Map Workspace to WorkspaceListItem (which is WorkspaceInfo)
    // Since getAll() returns Workspace[], we need to add the myRole field
    return workspaces.map(w => ({
      id: w.id,
      name: w.name,
      autoAddNewUsers: w.autoAddNewUsers,
      logo: w.logo,
      createdAt: w.createdAt,
      updatedAt: w.updatedAt,
      myRole: 'admin' as const, // Superuser has admin role on all workspaces
    }));
  }

  /**
   * Get a workspace by ID (for superuser access).
   */
  async getWorkspaceById(
    identity: Identity,
    workspaceId: string,
  ): Promise<WorkspaceListItem | null> {
    if (identity.type !== 'superuser') {
      throw new ForbiddenError('Only superusers can access workspaces directly');
    }

    const workspace = await this.workspaces.getByIdSimple(workspaceId);
    if (!workspace) {
      return null;
    }

    return {
      id: workspace.id,
      name: workspace.name,
      autoAddNewUsers: workspace.autoAddNewUsers,
      logo: workspace.logo,
      createdAt: workspace.createdAt,
      updatedAt: workspace.updatedAt,
      myRole: 'admin' as const, // Superuser has admin role on all workspaces
    };
  }
}
