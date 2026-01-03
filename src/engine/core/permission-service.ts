import type {Context} from './context';
import {ForbiddenError} from './errors';
import type {ApiKeyIdentity, Identity, UserIdentity} from './identity';
import {hasProjectAccess, hasScope, isSuperuserIdentity, isUserIdentity} from './identity';
import type {Logger} from './logger';
import {getHighestRole, type Role} from './role-utils';
import type {ConfigStore} from './stores/config-store';
import type {ConfigUserStore} from './stores/config-user-store';
import type {ProjectStore} from './stores/project-store';
import type {ProjectUserStore} from './stores/project-user-store';
import type {WorkspaceMemberStore} from './stores/workspace-member-store';
import {unique} from './utils';
import type {NormalizedEmail} from './zod';

export class PermissionService {
  constructor(
    private readonly configUserStore: ConfigUserStore,
    private readonly projectUserStore: ProjectUserStore,
    private readonly configStore: ConfigStore,
    private readonly projectStore: ProjectStore,
    private readonly workspaceMemberStore: WorkspaceMemberStore,
    private readonly logger: Logger,
  ) {}

  async getConfigMaintainers(configId: string): Promise<string[]> {
    const config = await this.configStore.getByIdUnsafe(configId);
    if (!config) return [];

    const configUsers = await this.configUserStore.getByConfigId({
      configId,
      projectId: config.projectId,
    });
    const projectUsers = await this.projectUserStore.getByProjectId(config.projectId);

    const configMaintainerEmails = configUsers
      .filter(cu => cu.role === 'maintainer')
      .map(cu => cu.user_email_normalized)
      .filter(Boolean) as string[];

    const projectMaintainerEmails = projectUsers
      .filter(pu => pu.role === 'admin' || pu.role === 'maintainer')
      .map(pu => pu.user_email_normalized)
      .filter(Boolean) as string[];

    return unique([...configMaintainerEmails, ...projectMaintainerEmails]);
  }

  async getConfigEditors(configId: string): Promise<string[]> {
    const config = await this.configStore.getByIdUnsafe(configId);
    if (!config) return [];

    const configUsers = await this.configUserStore.getByConfigId({
      configId,
      projectId: config.projectId,
    });
    const projectUsers = await this.projectUserStore.getByProjectId(config.projectId);

    const configEditorEmails = configUsers
      .filter(cu => cu.role === 'editor' || cu.role === 'maintainer')
      .map(cu => cu.user_email_normalized)
      .filter(Boolean) as string[];

    const projectOwnerEmails = projectUsers
      .filter(pu => pu.role === 'admin' || pu.role === 'maintainer')
      .map(pu => pu.user_email_normalized)
      .filter(Boolean) as string[];

    return unique([...configEditorEmails, ...projectOwnerEmails]);
  }

  // ============================================================================
  // User-based permission checks (used by API key identity checks internally)
  // ============================================================================

  private async canUserEditConfig(
    ctx: Context,
    params: {configId: string; currentUserEmail: NormalizedEmail},
  ): Promise<boolean> {
    const config = await this.configStore.getByIdUnsafe(params.configId);
    if (!config) return false;

    const isWorkspaceMember = await this.isUserWorkspaceMember(ctx, {
      projectId: config.projectId,
      currentUserEmail: params.currentUserEmail,
    });
    if (!isWorkspaceMember) return false;

    // Workspace admins can edit any config in their workspace
    const isWorkspaceAdmin = await this.isUserWorkspaceAdminForProject(ctx, {
      projectId: config.projectId,
      currentUserEmail: params.currentUserEmail,
    });
    if (isWorkspaceAdmin) return true;

    const configUser = await this.configUserStore.getByConfigIdAndEmail({
      configId: params.configId,
      userEmail: params.currentUserEmail,
      projectId: config.projectId,
    });
    return (
      configUser?.role === 'editor' ||
      configUser?.role === 'maintainer' ||
      (await this.canUserEditProjectConfigs(ctx, {
        projectId: config.projectId,
        currentUserEmail: params.currentUserEmail,
      }))
    );
  }

  private async canUserManageConfig(
    ctx: Context,
    params: {configId: string; currentUserEmail: NormalizedEmail},
  ): Promise<boolean> {
    const config = await this.configStore.getByIdUnsafe(params.configId);
    if (!config) return false;

    const isWorkspaceMember = await this.isUserWorkspaceMember(ctx, {
      projectId: config.projectId,
      currentUserEmail: params.currentUserEmail,
    });
    if (!isWorkspaceMember) return false;

    // Workspace admins can manage any config in their workspace
    const isWorkspaceAdmin = await this.isUserWorkspaceAdminForProject(ctx, {
      projectId: config.projectId,
      currentUserEmail: params.currentUserEmail,
    });
    if (isWorkspaceAdmin) return true;

    const user = await this.configUserStore.getByConfigIdAndEmail({
      configId: params.configId,
      userEmail: params.currentUserEmail,
      projectId: config.projectId,
    });

    if (user?.role === 'maintainer') return true;

    return await this.canUserManageProjectConfigs(ctx, {
      projectId: config.projectId,
      currentUserEmail: params.currentUserEmail,
    });
  }

  private async canUserManageProjectSdkKeys(
    ctx: Context,
    params: {projectId: string; currentUserEmail: NormalizedEmail},
  ): Promise<boolean> {
    const isWorkspaceMember = await this.isUserWorkspaceMember(ctx, {
      projectId: params.projectId,
      currentUserEmail: params.currentUserEmail,
    });
    if (!isWorkspaceMember) return false;

    // Workspace admins can manage SDK keys for any project in their workspace
    const isWorkspaceAdmin = await this.isUserWorkspaceAdminForProject(ctx, {
      projectId: params.projectId,
      currentUserEmail: params.currentUserEmail,
    });
    if (isWorkspaceAdmin) return true;

    const user = await this.projectUserStore.getByProjectIdAndEmail({
      projectId: params.projectId,
      userEmail: params.currentUserEmail,
    });
    if (!user) return false;
    return user.role === 'admin' || user.role === 'maintainer';
  }

  private async canUserManageProject(
    ctx: Context,
    params: {projectId: string; currentUserEmail: NormalizedEmail},
  ): Promise<boolean> {
    const isWorkspaceMember = await this.isUserWorkspaceMember(ctx, {
      projectId: params.projectId,
      currentUserEmail: params.currentUserEmail,
    });
    if (!isWorkspaceMember) return false;

    // Workspace admins can manage any project in their workspace
    const isWorkspaceAdmin = await this.isUserWorkspaceAdminForProject(ctx, {
      projectId: params.projectId,
      currentUserEmail: params.currentUserEmail,
    });
    if (isWorkspaceAdmin) return true;

    const user = await this.projectUserStore.getByProjectIdAndEmail({
      projectId: params.projectId,
      userEmail: params.currentUserEmail,
    });
    if (!user) return false;
    return user.role === 'admin' || user.role === 'maintainer';
  }

  private async canUserDeleteProject(
    ctx: Context,
    params: {projectId: string; currentUserEmail: NormalizedEmail},
  ): Promise<boolean> {
    const isWorkspaceMember = await this.isUserWorkspaceMember(ctx, {
      projectId: params.projectId,
      currentUserEmail: params.currentUserEmail,
    });
    if (!isWorkspaceMember) return false;

    // Workspace admins can delete any project in their workspace
    const isWorkspaceAdmin = await this.isUserWorkspaceAdminForProject(ctx, {
      projectId: params.projectId,
      currentUserEmail: params.currentUserEmail,
    });
    if (isWorkspaceAdmin) return true;

    const user = await this.projectUserStore.getByProjectIdAndEmail({
      projectId: params.projectId,
      userEmail: params.currentUserEmail,
    });
    if (!user) return false;
    return user.role === 'admin';
  }

  private async canUserEditProjectConfigs(
    ctx: Context,
    params: {projectId: string; currentUserEmail: NormalizedEmail},
  ): Promise<boolean> {
    const isWorkspaceMember = await this.isUserWorkspaceMember(ctx, {
      projectId: params.projectId,
      currentUserEmail: params.currentUserEmail,
    });
    if (!isWorkspaceMember) return false;

    // Workspace admins can edit configs in any project in their workspace
    const isWorkspaceAdmin = await this.isUserWorkspaceAdminForProject(ctx, {
      projectId: params.projectId,
      currentUserEmail: params.currentUserEmail,
    });
    if (isWorkspaceAdmin) return true;

    const user = await this.projectUserStore.getByProjectIdAndEmail({
      projectId: params.projectId,
      userEmail: params.currentUserEmail,
    });
    if (!user) return false;
    return user.role === 'admin' || user.role === 'maintainer';
  }

  private async canUserManageProjectConfigs(
    ctx: Context,
    params: {projectId: string; currentUserEmail: NormalizedEmail},
  ): Promise<boolean> {
    const isWorkspaceMember = await this.isUserWorkspaceMember(ctx, {
      projectId: params.projectId,
      currentUserEmail: params.currentUserEmail,
    });
    if (!isWorkspaceMember) return false;

    // Workspace admins can manage configs in any project in their workspace
    const isWorkspaceAdmin = await this.isUserWorkspaceAdminForProject(ctx, {
      projectId: params.projectId,
      currentUserEmail: params.currentUserEmail,
    });
    if (isWorkspaceAdmin) return true;

    const user = await this.projectUserStore.getByProjectIdAndEmail({
      projectId: params.projectId,
      userEmail: params.currentUserEmail,
    });
    if (!user) return false;
    return user.role === 'admin' || user.role === 'maintainer';
  }

  private async canUserManageProjectUsers(
    ctx: Context,
    params: {projectId: string; currentUserEmail: NormalizedEmail},
  ): Promise<boolean> {
    const isWorkspaceMember = await this.isUserWorkspaceMember(ctx, {
      projectId: params.projectId,
      currentUserEmail: params.currentUserEmail,
    });
    if (!isWorkspaceMember) return false;

    // Workspace admins can manage users in any project in their workspace
    const isWorkspaceAdmin = await this.isUserWorkspaceAdminForProject(ctx, {
      projectId: params.projectId,
      currentUserEmail: params.currentUserEmail,
    });
    if (isWorkspaceAdmin) return true;

    const user = await this.projectUserStore.getByProjectIdAndEmail({
      projectId: params.projectId,
      userEmail: params.currentUserEmail,
    });
    if (!user) return false;
    return user.role === 'admin';
  }

  private async canUserManageProjectEnvironments(
    ctx: Context,
    params: {projectId: string; currentUserEmail: NormalizedEmail},
  ): Promise<boolean> {
    const isWorkspaceMember = await this.isUserWorkspaceMember(ctx, {
      projectId: params.projectId,
      currentUserEmail: params.currentUserEmail,
    });
    if (!isWorkspaceMember) return false;

    // Workspace admins can manage environments in any project in their workspace
    const isWorkspaceAdmin = await this.isUserWorkspaceAdminForProject(ctx, {
      projectId: params.projectId,
      currentUserEmail: params.currentUserEmail,
    });
    if (isWorkspaceAdmin) return true;

    const user = await this.projectUserStore.getByProjectIdAndEmail({
      projectId: params.projectId,
      userEmail: params.currentUserEmail,
    });
    if (!user) return false;
    return user.role === 'admin';
  }

  private async canUserCreateConfig(
    ctx: Context,
    params: {projectId: string; currentUserEmail: NormalizedEmail},
  ): Promise<boolean> {
    const isWorkspaceMember = await this.isUserWorkspaceMember(ctx, {
      projectId: params.projectId,
      currentUserEmail: params.currentUserEmail,
    });
    if (!isWorkspaceMember) return false;

    // Workspace admins can create configs in any project in their workspace
    const isWorkspaceAdmin = await this.isUserWorkspaceAdminForProject(ctx, {
      projectId: params.projectId,
      currentUserEmail: params.currentUserEmail,
    });
    if (isWorkspaceAdmin) return true;

    return await this.canUserManageProjectConfigs(ctx, params);
  }

  private async isUserWorkspaceMember(
    ctx: Context,
    params:
      | {projectId: string; currentUserEmail: NormalizedEmail}
      | {workspaceId: string; currentUserEmail: NormalizedEmail},
  ): Promise<boolean> {
    if ('projectId' in params) {
      // Check if user is a member of the project's workspace
      const project = await this.projectStore.getById({
        id: params.projectId,
        currentUserEmail: params.currentUserEmail,
      });
      if (!project) return false;

      const workspaceMember = await this.workspaceMemberStore.getByWorkspaceIdAndEmail({
        workspaceId: project.workspaceId,
        userEmail: params.currentUserEmail,
      });

      if (!workspaceMember) {
        // Check if user has explicit project role
        const user = await this.projectUserStore.getByProjectIdAndEmail({
          projectId: params.projectId,
          userEmail: params.currentUserEmail,
        });
        if (user) {
          // this should never happen
          this.logger.error(ctx, {
            msg: `User ${params.currentUserEmail} is not a member of workspace ${project.workspaceId} but has explicit project role`,
          });
        }
      }

      return !!workspaceMember;
    } else {
      const member = await this.workspaceMemberStore.getByWorkspaceIdAndEmail({
        workspaceId: params.workspaceId,
        userEmail: params.currentUserEmail,
      });
      return !!member;
    }
  }

  private async isUserWorkspaceAdmin(
    ctx: Context,
    params: {workspaceId: string; currentUserEmail: NormalizedEmail},
  ): Promise<boolean> {
    const member = await this.workspaceMemberStore.getByWorkspaceIdAndEmail({
      workspaceId: params.workspaceId,
      userEmail: params.currentUserEmail,
    });
    return member?.role === 'admin';
  }

  /**
   * Check if user is a workspace admin for the workspace that contains this project.
   * Workspace admins have full access to all projects in their workspace.
   */
  private async isUserWorkspaceAdminForProject(
    ctx: Context,
    params: {projectId: string; currentUserEmail: NormalizedEmail},
  ): Promise<boolean> {
    const project = await this.projectStore.getById({
      id: params.projectId,
      currentUserEmail: params.currentUserEmail,
    });
    if (!project) return false;

    return this.isUserWorkspaceAdmin(ctx, {
      workspaceId: project.workspaceId,
      currentUserEmail: params.currentUserEmail,
    });
  }

  // ============================================================================
  // API Key permission checks
  // ============================================================================

  private async canApiKeyAccessProject(
    ctx: Context,
    identity: ApiKeyIdentity,
    projectId: string,
  ): Promise<boolean> {
    const project = await this.projectStore.getByIdWithoutPermissionCheck(projectId);
    if (!project) return false;
    return hasProjectAccess({identity, project});
  }

  private async getConfigProjectId(configId: string): Promise<string | null> {
    const config = await this.configStore.getByIdUnsafe(configId);
    return config?.projectId ?? null;
  }

  // ============================================================================
  // Identity-based permission checks (public API)
  // ============================================================================

  async canEditConfig(
    ctx: Context,
    params: {configId: string; identity: Identity},
  ): Promise<boolean> {
    if (isSuperuserIdentity(params.identity)) return true;
    if (isUserIdentity(params.identity)) {
      return this.canUserEditConfig(ctx, {
        configId: params.configId,
        currentUserEmail: params.identity.user.email,
      });
    }

    // API key: check scope and project access
    if (!hasScope(params.identity, 'config:write')) {
      return false;
    }

    const projectId = await this.getConfigProjectId(params.configId);
    if (!projectId) return false;

    return this.canApiKeyAccessProject(ctx, params.identity, projectId);
  }

  async canManageConfig(
    ctx: Context,
    params: {configId: string; identity: Identity},
  ): Promise<boolean> {
    if (isSuperuserIdentity(params.identity)) return true;
    if (isUserIdentity(params.identity)) {
      return this.canUserManageConfig(ctx, {
        configId: params.configId,
        currentUserEmail: params.identity.user.email,
      });
    }

    // API key: check scope and project access
    if (!hasScope(params.identity, 'config:write')) {
      return false;
    }

    const projectId = await this.getConfigProjectId(params.configId);
    if (!projectId) return false;

    return this.canApiKeyAccessProject(ctx, params.identity, projectId);
  }

  async canManageProjectSdkKeys(
    ctx: Context,
    params: {projectId: string; identity: Identity},
  ): Promise<boolean> {
    if (isSuperuserIdentity(params.identity)) return true;
    if (isUserIdentity(params.identity)) {
      return this.canUserManageProjectSdkKeys(ctx, {
        projectId: params.projectId,
        currentUserEmail: params.identity.user.email,
      });
    }

    // API key: check scope and project access
    if (!hasScope(params.identity, 'sdk_key:write')) {
      return false;
    }

    return this.canApiKeyAccessProject(ctx, params.identity, params.projectId);
  }

  async canManageProject(
    ctx: Context,
    params: {projectId: string; identity: Identity},
  ): Promise<boolean> {
    if (isSuperuserIdentity(params.identity)) return true;
    if (isUserIdentity(params.identity)) {
      return this.canUserManageProject(ctx, {
        projectId: params.projectId,
        currentUserEmail: params.identity.user.email,
      });
    }

    // API key: check scope and project access
    if (!hasScope(params.identity, 'project:write')) {
      return false;
    }

    return this.canApiKeyAccessProject(ctx, params.identity, params.projectId);
  }

  async canCreateProject(
    ctx: Context,
    params: {workspaceId: string; identity: Identity},
  ): Promise<boolean> {
    if (isSuperuserIdentity(params.identity)) return true;
    if (isUserIdentity(params.identity)) {
      // Users can create projects if they're workspace members
      return this.isUserWorkspaceMember(ctx, {
        workspaceId: params.workspaceId,
        currentUserEmail: params.identity.user.email,
      });
    }

    // API key: check scope and workspace match
    if (!hasScope(params.identity, 'project:write')) {
      return false;
    }

    return params.identity.workspaceId === params.workspaceId;
  }

  async canDeleteProject(
    ctx: Context,
    params: {projectId: string; identity: Identity},
  ): Promise<boolean> {
    if (isSuperuserIdentity(params.identity)) return true;
    if (isUserIdentity(params.identity)) {
      return this.canUserDeleteProject(ctx, {
        projectId: params.projectId,
        currentUserEmail: params.identity.user.email,
      });
    }

    // API key: check scope and project access
    if (!hasScope(params.identity, 'project:write')) {
      return false;
    }

    return this.canApiKeyAccessProject(ctx, params.identity, params.projectId);
  }

  async canEditProjectConfigs(
    ctx: Context,
    params: {projectId: string; identity: Identity},
  ): Promise<boolean> {
    if (isSuperuserIdentity(params.identity)) return true;
    if (isUserIdentity(params.identity)) {
      return this.canUserEditProjectConfigs(ctx, {
        projectId: params.projectId,
        currentUserEmail: params.identity.user.email,
      });
    }

    // API key: check scope and project access
    if (!hasScope(params.identity, 'config:write')) {
      return false;
    }

    return this.canApiKeyAccessProject(ctx, params.identity, params.projectId);
  }

  async canManageProjectConfigs(
    ctx: Context,
    params: {projectId: string; identity: Identity},
  ): Promise<boolean> {
    if (isSuperuserIdentity(params.identity)) return true;
    if (isUserIdentity(params.identity)) {
      return this.canUserManageProjectConfigs(ctx, {
        projectId: params.projectId,
        currentUserEmail: params.identity.user.email,
      });
    }

    // API key: check scope and project access
    if (!hasScope(params.identity, 'config:write')) {
      return false;
    }

    return this.canApiKeyAccessProject(ctx, params.identity, params.projectId);
  }

  async canManageProjectUsers(
    ctx: Context,
    params: {projectId: string; identity: Identity},
  ): Promise<boolean> {
    if (isSuperuserIdentity(params.identity)) return true;
    if (isUserIdentity(params.identity)) {
      return this.canUserManageProjectUsers(ctx, {
        projectId: params.projectId,
        currentUserEmail: params.identity.user.email,
      });
    }

    // API key: check scope and project access
    if (!hasScope(params.identity, 'member:write')) {
      return false;
    }

    return this.canApiKeyAccessProject(ctx, params.identity, params.projectId);
  }

  async canManageProjectEnvironments(
    ctx: Context,
    params: {projectId: string; identity: Identity},
  ): Promise<boolean> {
    if (isSuperuserIdentity(params.identity)) return true;
    if (isUserIdentity(params.identity)) {
      return this.canUserManageProjectEnvironments(ctx, {
        projectId: params.projectId,
        currentUserEmail: params.identity.user.email,
      });
    }

    // API key: check scope and project access
    if (!hasScope(params.identity, 'environment:write')) {
      return false;
    }

    return this.canApiKeyAccessProject(ctx, params.identity, params.projectId);
  }

  async canCreateConfig(
    ctx: Context,
    params: {projectId: string; identity: Identity},
  ): Promise<boolean> {
    if (isSuperuserIdentity(params.identity)) return true;
    if (isUserIdentity(params.identity)) {
      return this.canUserCreateConfig(ctx, {
        projectId: params.projectId,
        currentUserEmail: params.identity.user.email,
      });
    }

    // API key: check scope and project access
    if (!hasScope(params.identity, 'config:write')) {
      return false;
    }

    return this.canApiKeyAccessProject(ctx, params.identity, params.projectId);
  }

  async canCreateWorkspace(ctx: Context, params: {identity: Identity}): Promise<boolean> {
    if (params.identity.type === 'superuser') {
      return true;
    } else if (params.identity.type === 'api_key') {
      return false;
    } else {
      return true;
    }
  }

  async isWorkspaceMember(
    ctx: Context,
    params: {projectId: string; identity: Identity} | {workspaceId: string; identity: Identity},
  ): Promise<boolean> {
    if (isSuperuserIdentity(params.identity)) return true;
    if (isUserIdentity(params.identity)) {
      if ('projectId' in params) {
        return this.isUserWorkspaceMember(ctx, {
          projectId: params.projectId,
          currentUserEmail: params.identity.user.email,
        });
      } else {
        return this.isUserWorkspaceMember(ctx, {
          workspaceId: params.workspaceId,
          currentUserEmail: params.identity.user.email,
        });
      }
    }

    // API key: check workspace match
    if ('workspaceId' in params) {
      return params.identity.workspaceId === params.workspaceId;
    }

    // Check if project belongs to API key's workspace
    return this.canApiKeyAccessProject(ctx, params.identity, params.projectId);
  }

  async isWorkspaceAdmin(
    ctx: Context,
    params: {workspaceId: string; identity: Identity},
  ): Promise<boolean> {
    if (isSuperuserIdentity(params.identity)) return true;
    if (isUserIdentity(params.identity)) {
      return this.isUserWorkspaceAdmin(ctx, {
        workspaceId: params.workspaceId,
        currentUserEmail: params.identity.user.email,
      });
    }

    // API keys cannot be workspace admins
    return false;
  }

  /**
   * Check if user is a workspace admin for the workspace that contains the given project.
   * Workspace admins have full access to all projects and configs in their workspace.
   */
  async isWorkspaceAdminForProject(
    ctx: Context,
    params: {projectId: string; identity: Identity},
  ): Promise<boolean> {
    if (isSuperuserIdentity(params.identity)) return true;
    if (isUserIdentity(params.identity)) {
      return this.isUserWorkspaceAdminForProject(ctx, {
        projectId: params.projectId,
        currentUserEmail: params.identity.user.email,
      });
    }

    // API keys cannot be workspace admins - admin operations require user identity
    return false;
  }

  /**
   * Infer the user's effective role on a project by combining:
   * - Their explicit project role (from project_users table)
   * - Their workspace admin status (workspace admins get admin role on all projects)
   *
   * Returns null for API key identities (they don't have project roles).
   */
  async inferUserProjectRole(
    ctx: Context,
    params: {projectId: string; identity: Identity},
  ): Promise<Role | null> {
    if (isSuperuserIdentity(params.identity)) return 'admin';
    if (!isUserIdentity(params.identity)) {
      // API keys don't have project roles
      return null;
    }

    const [projectUser, isWorkspaceAdmin] = await Promise.all([
      this.projectUserStore.getByProjectIdAndEmail({
        projectId: params.projectId,
        userEmail: params.identity.user.email,
      }),
      this.isUserWorkspaceAdminForProject(ctx, {
        projectId: params.projectId,
        currentUserEmail: params.identity.user.email,
      }),
    ]);

    return getHighestRole([projectUser?.role ?? 'viewer', isWorkspaceAdmin ? 'admin' : 'viewer']);
  }

  async canReadProject(
    ctx: Context,
    params: {projectId: string; identity: Identity},
  ): Promise<boolean> {
    if (isSuperuserIdentity(params.identity)) return true;
    if (isUserIdentity(params.identity)) {
      // Users can read projects if they're workspace members
      return this.isUserWorkspaceMember(ctx, {
        projectId: params.projectId,
        currentUserEmail: params.identity.user.email,
      });
    }

    // API key: check scope and project access
    if (!hasScope(params.identity, 'project:read')) {
      return false;
    }

    return this.canApiKeyAccessProject(ctx, params.identity, params.projectId);
  }

  async canReadConfig(
    ctx: Context,
    params: {configId: string; identity: Identity},
  ): Promise<boolean> {
    if (isSuperuserIdentity(params.identity)) return true;
    const projectId = await this.getConfigProjectId(params.configId);
    if (!projectId) return false;

    if (isUserIdentity(params.identity)) {
      // Users can read configs if they're workspace members
      return this.isUserWorkspaceMember(ctx, {
        projectId,
        currentUserEmail: params.identity.user.email,
      });
    }

    // API key: check scope and project access
    // Note: config:write implies config:read
    if (!hasScope(params.identity, 'config:read') && !hasScope(params.identity, 'config:write')) {
      return false;
    }

    return this.canApiKeyAccessProject(ctx, params.identity, projectId);
  }

  async canReadConfigs(
    ctx: Context,
    params: {projectId: string; identity: Identity},
  ): Promise<boolean> {
    if (isSuperuserIdentity(params.identity)) return true;
    if (isUserIdentity(params.identity)) {
      // Users can read configs if they're workspace members
      return this.isUserWorkspaceMember(ctx, {
        projectId: params.projectId,
        currentUserEmail: params.identity.user.email,
      });
    }

    // API key: check scope and project access
    // Note: config:write implies config:read
    if (!hasScope(params.identity, 'config:read') && !hasScope(params.identity, 'config:write')) {
      return false;
    }

    return this.canApiKeyAccessProject(ctx, params.identity, params.projectId);
  }

  async canReadSdkKeys(
    ctx: Context,
    params: {projectId: string; identity: Identity},
  ): Promise<boolean> {
    if (isSuperuserIdentity(params.identity)) return true;
    if (isUserIdentity(params.identity)) {
      // Users can read SDK keys if they're workspace members
      return this.isUserWorkspaceMember(ctx, {
        projectId: params.projectId,
        currentUserEmail: params.identity.user.email,
      });
    }

    // API key: check scope and project access
    if (!hasScope(params.identity, 'sdk_key:read')) {
      return false;
    }

    return this.canApiKeyAccessProject(ctx, params.identity, params.projectId);
  }

  async canReadEnvironments(
    ctx: Context,
    params: {projectId: string; identity: Identity},
  ): Promise<boolean> {
    if (isSuperuserIdentity(params.identity)) return true;
    if (isUserIdentity(params.identity)) {
      // Users can read environments if they're workspace members
      return this.isUserWorkspaceMember(ctx, {
        projectId: params.projectId,
        currentUserEmail: params.identity.user.email,
      });
    }

    // API key: check scope and project access
    // Note: config:write implies environment:read since creating/updating configs requires knowing environments
    if (
      !hasScope(params.identity, 'environment:read') &&
      !hasScope(params.identity, 'config:write')
    ) {
      return false;
    }

    return this.canApiKeyAccessProject(ctx, params.identity, params.projectId);
  }

  async canReadMembers(
    ctx: Context,
    params: {projectId: string; identity: Identity},
  ): Promise<boolean> {
    if (isSuperuserIdentity(params.identity)) return true;
    if (isUserIdentity(params.identity)) {
      // Users can read members if they're workspace members
      return this.isUserWorkspaceMember(ctx, {
        projectId: params.projectId,
        currentUserEmail: params.identity.user.email,
      });
    }

    // API key: check scope and project access
    if (!hasScope(params.identity, 'member:read')) {
      return false;
    }

    return this.canApiKeyAccessProject(ctx, params.identity, params.projectId);
  }

  // ============================================================================
  // Ensure methods (throw on failure)
  // ============================================================================

  async ensureCanCreateWorkspace(ctx: Context, params: {identity: Identity}): Promise<void> {
    const canCreate = await this.canCreateWorkspace(ctx, params);
    if (!canCreate) {
      throw new ForbiddenError('User does not have permission to create workspaces');
    }
  }

  async ensureCanEditConfig(
    ctx: Context,
    params: {configId: string; identity: Identity},
  ): Promise<void> {
    const canEdit = await this.canEditConfig(ctx, params);
    if (!canEdit) {
      throw new ForbiddenError('User does not have permission to edit this config');
    }
  }

  async ensureCanManageConfig(
    ctx: Context,
    params: {configId: string; identity: Identity},
  ): Promise<void> {
    const canManage = await this.canManageConfig(ctx, params);
    if (!canManage) {
      throw new ForbiddenError('User does not have permission to manage this config');
    }
  }

  async ensureCanManageSdkKeys(
    ctx: Context,
    params: {projectId: string; identity: Identity},
  ): Promise<void> {
    const canManage = await this.canManageProjectSdkKeys(ctx, params);
    if (!canManage) {
      throw new ForbiddenError('User does not have permission to manage SDK keys for this project');
    }
  }

  async ensureCanManageProject(
    ctx: Context,
    params: {projectId: string; identity: Identity},
  ): Promise<void> {
    const canManage = await this.canManageProject(ctx, params);
    if (!canManage) {
      throw new ForbiddenError('User does not have permission to manage this project');
    }
  }

  async ensureCanManageProjectUsers(
    ctx: Context,
    params: {projectId: string; identity: Identity},
  ): Promise<void> {
    const canManage = await this.canManageProjectUsers(ctx, params);
    if (!canManage) {
      throw new ForbiddenError('User does not have permission to manage users for this project');
    }
  }

  async ensureCanManageProjectEnvironments(
    ctx: Context,
    params: {projectId: string; identity: Identity},
  ): Promise<void> {
    const canManage = await this.canManageProjectEnvironments(ctx, params);
    if (!canManage) {
      throw new ForbiddenError(
        'User does not have permission to manage environments for this project',
      );
    }
  }

  async ensureCanCreateConfig(
    ctx: Context,
    params: {projectId: string; identity: Identity},
  ): Promise<void> {
    const canCreate = await this.canCreateConfig(ctx, params);
    if (!canCreate) {
      throw new ForbiddenError('User does not have permission to create configs in this project');
    }
  }

  async ensureCanCreateProject(
    ctx: Context,
    params: {workspaceId: string; identity: Identity},
  ): Promise<void> {
    const canCreate = await this.canCreateProject(ctx, params);
    if (!canCreate) {
      throw new ForbiddenError(
        'User does not have permission to create projects in this workspace',
      );
    }
  }

  async ensureCanDeleteProject(
    ctx: Context,
    params: {projectId: string; identity: Identity},
  ): Promise<void> {
    const canDelete = await this.canDeleteProject(ctx, params);
    if (!canDelete) {
      throw new ForbiddenError('User does not have permission to delete this project');
    }
  }

  async ensureIsWorkspaceMember(
    ctx: Context,
    params: {projectId: string; identity: Identity} | {workspaceId: string; identity: Identity},
  ): Promise<void> {
    const canView = await this.isWorkspaceMember(ctx, params);
    if (!canView) {
      throw new ForbiddenError('User does not have permission to view this project');
    }
  }

  async ensureIsWorkspaceAdmin(
    ctx: Context,
    params: {workspaceId: string; identity: Identity},
  ): Promise<void> {
    const isAdmin = await this.isWorkspaceAdmin(ctx, params);
    if (!isAdmin) {
      throw new ForbiddenError('User is not an admin of this workspace');
    }
  }

  async ensureCanReadProject(
    ctx: Context,
    params: {projectId: string; identity: Identity},
  ): Promise<void> {
    const canRead = await this.canReadProject(ctx, params);
    if (!canRead) {
      throw new ForbiddenError('User does not have permission to read this project');
    }
  }

  async ensureCanReadConfig(
    ctx: Context,
    params: {configId: string; identity: Identity},
  ): Promise<void> {
    const canRead = await this.canReadConfig(ctx, params);
    if (!canRead) {
      throw new ForbiddenError('User does not have permission to read this config');
    }
  }

  async ensureCanReadConfigs(
    ctx: Context,
    params: {projectId: string; identity: Identity},
  ): Promise<void> {
    const canRead = await this.canReadConfigs(ctx, params);
    if (!canRead) {
      throw new ForbiddenError('User does not have permission to read configs for this project');
    }
  }

  async ensureCanReadSdkKeys(
    ctx: Context,
    params: {projectId: string; identity: Identity},
  ): Promise<void> {
    const canRead = await this.canReadSdkKeys(ctx, params);
    if (!canRead) {
      throw new ForbiddenError('User does not have permission to read SDK keys for this project');
    }
  }

  async ensureCanReadEnvironments(
    ctx: Context,
    params: {projectId: string; identity: Identity},
  ): Promise<void> {
    const canRead = await this.canReadEnvironments(ctx, params);
    if (!canRead) {
      throw new ForbiddenError(
        'User does not have permission to read environments for this project',
      );
    }
  }

  async ensureCanReadMembers(
    ctx: Context,
    params: {projectId: string; identity: Identity},
  ): Promise<void> {
    const canRead = await this.canReadMembers(ctx, params);
    if (!canRead) {
      throw new ForbiddenError('User does not have permission to read members for this project');
    }
  }

  // ============================================================================
  // User identity requirement check
  // ============================================================================

  /**
   * Ensure the identity is a user (not an API key).
   * Some operations (like workspace management) require a user identity.
   */
  ensureUserIdentity(identity: Identity): asserts identity is UserIdentity {
    if (!isUserIdentity(identity)) {
      throw new ForbiddenError('This operation requires a user identity, not an API key');
    }
  }
}
