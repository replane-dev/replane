import type {ConfigService} from './config-service';
import type {Context} from './context';
import type {Identity} from './identity';
import type {AuditLogStore} from './stores/audit-log-store';
import type {ConfigStore} from './stores/config-store';
import type {ProjectEnvironmentStore} from './stores/project-environment-store';
import type {ProjectStore} from './stores/project-store';
import type {ProjectUserStore} from './stores/project-user-store';
import type {WorkspaceMemberStore} from './stores/workspace-member-store';
import type {WorkspaceInfo, WorkspaceStore} from './stores/workspace-store';
import {createWorkspace} from './use-cases/create-workspace-use-case';
import type {UserStore} from './user-store';

export type WorkspaceListItem = WorkspaceInfo;

export class WorkspaceQueryService {
  constructor(
    private workspaces: WorkspaceStore,
    private workspaceMembers: WorkspaceMemberStore,
    private projects: ProjectStore,
    private projectUsers: ProjectUserStore,
    private projectEnvironments: ProjectEnvironmentStore,
    private configs: ConfigStore,
    private configService: ConfigService,
    private users: UserStore,
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
}
