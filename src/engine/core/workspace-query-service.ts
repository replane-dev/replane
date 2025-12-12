import type {AuditLogStore} from './stores/audit-log-store';
import type {ConfigStore} from './stores/config-store';
import type {ConfigVariantStore} from './stores/config-variant-store';
import type {ProjectEnvironmentStore} from './stores/project-environment-store';
import type {ProjectStore} from './stores/project-store';
import type {ProjectUserStore} from './stores/project-user-store';
import type {WorkspaceMemberStore} from './stores/workspace-member-store';
import type {WorkspaceInfo, WorkspaceStore} from './stores/workspace-store';
import {createWorkspace} from './use-cases/create-workspace-use-case';
import type {UserStore} from './user-store';
import type {NormalizedEmail} from './zod';

export type WorkspaceListItem = WorkspaceInfo;

export class WorkspaceQueryService {
  constructor(
    private workspaces: WorkspaceStore,
    private workspaceMembers: WorkspaceMemberStore,
    private projects: ProjectStore,
    private projectUsers: ProjectUserStore,
    private projectEnvironments: ProjectEnvironmentStore,
    private configs: ConfigStore,
    private configVariants: ConfigVariantStore,
    private users: UserStore,
    private auditLogs: AuditLogStore,
  ) {}

  async getOrCreateUserWorkspaces(opts: {
    currentUserEmail: NormalizedEmail;
  }): Promise<WorkspaceListItem[]> {
    const workspaces = await this.workspaces.getAllTheUserMemberOf({
      currentUserEmail: opts.currentUserEmail,
    });

    if (workspaces.length === 0) {
      await createWorkspace({
        currentUserEmail: opts.currentUserEmail,
        name: {type: 'personal'},
        workspaceStore: this.workspaces,
        workspaceMemberStore: this.workspaceMembers,
        projectStore: this.projects,
        projectUserStore: this.projectUsers,
        projectEnvironmentStore: this.projectEnvironments,
        configs: this.configs,
        configVariants: this.configVariants,
        users: this.users,
        auditLogs: this.auditLogs,
        now: new Date(),
        exampleProject: true,
      });
    }

    return this.workspaces.getAllTheUserMemberOf({currentUserEmail: opts.currentUserEmail});
  }
}
