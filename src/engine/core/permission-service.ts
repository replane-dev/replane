import type {Context} from './context';
import {ForbiddenError} from './errors';
import type {Logger} from './logger';
import type {ConfigStore} from './stores/config-store';
import type {ConfigUserStore} from './stores/config-user-store';
import type {OrganizationMemberStore} from './stores/organization-member-store';
import type {ProjectStore} from './stores/project-store';
import type {ProjectUserStore} from './stores/project-user-store';
import {unique} from './utils';
import type {NormalizedEmail} from './zod';

export class PermissionService {
  constructor(
    private readonly configUserStore: ConfigUserStore,
    private readonly projectUserStore: ProjectUserStore,
    private readonly configStore: ConfigStore,
    private readonly projectStore: ProjectStore,
    private readonly organizationMemberStore: OrganizationMemberStore,
    private readonly logger: Logger,
  ) {}

  async getConfigOwners(configId: string): Promise<string[]> {
    const config = await this.configStore.getById(configId);
    if (!config) return [];

    const configUsers = await this.configUserStore.getByConfigId(configId);
    const projectUsers = await this.projectUserStore.getByProjectId(config.projectId);

    const configOwnerEmails = configUsers
      .filter(cu => cu.role === 'maintainer')
      .map(cu => cu.user_email_normalized)
      .filter(Boolean) as string[];

    const projectOwnerEmails = projectUsers
      .filter(pu => pu.role === 'admin' || pu.role === 'maintainer')
      .map(pu => pu.user_email_normalized)
      .filter(Boolean) as string[];

    return unique([...configOwnerEmails, ...projectOwnerEmails]);
  }

  async getConfigEditors(configId: string): Promise<string[]> {
    const config = await this.configStore.getById(configId);
    if (!config) return [];

    const configUsers = await this.configUserStore.getByConfigId(configId);
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

  async canEditConfig(
    ctx: Context,
    params: {configId: string; currentUserEmail: NormalizedEmail},
  ): Promise<boolean> {
    const config = await this.configStore.getById(params.configId);
    if (!config) return false;

    const isOrgMember = await this.isOrganizationMember(ctx, {
      projectId: config.projectId,
      currentUserEmail: params.currentUserEmail,
    });
    if (!isOrgMember) return false;

    const configUser = await this.configUserStore.getByConfigIdAndEmail({
      configId: params.configId,
      userEmail: params.currentUserEmail,
    });
    return (
      configUser?.role === 'editor' ||
      configUser?.role === 'maintainer' ||
      (await this.canEditProjectConfigs(ctx, {
        projectId: config.projectId,
        currentUserEmail: params.currentUserEmail,
      }))
    );
  }

  async canManageConfig(
    ctx: Context,
    params: {configId: string; currentUserEmail: NormalizedEmail},
  ): Promise<boolean> {
    const config = await this.configStore.getById(params.configId);
    if (!config) return false;

    const isOrgMember = await this.isOrganizationMember(ctx, {
      projectId: config.projectId,
      currentUserEmail: params.currentUserEmail,
    });
    if (!isOrgMember) return false;

    const user = await this.configUserStore.getByConfigIdAndEmail({
      configId: params.configId,
      userEmail: params.currentUserEmail,
    });

    if (user?.role === 'maintainer') return true;

    return await this.canManageProjectConfigs(ctx, {
      projectId: config.projectId,
      currentUserEmail: params.currentUserEmail,
    });
  }

  async canManageProjectApiKeys(
    ctx: Context,
    params: {projectId: string; currentUserEmail: NormalizedEmail},
  ): Promise<boolean> {
    const isOrgMember = await this.isOrganizationMember(ctx, {
      projectId: params.projectId,
      currentUserEmail: params.currentUserEmail,
    });
    if (!isOrgMember) return false;

    const user = await this.projectUserStore.getByProjectIdAndEmail({
      projectId: params.projectId,
      userEmail: params.currentUserEmail,
    });
    if (!user) return false;
    return user.role === 'admin' || user.role === 'maintainer';
  }

  async canManageProject(
    ctx: Context,
    params: {projectId: string; currentUserEmail: NormalizedEmail},
  ): Promise<boolean> {
    const isOrgMember = await this.isOrganizationMember(ctx, {
      projectId: params.projectId,
      currentUserEmail: params.currentUserEmail,
    });
    if (!isOrgMember) return false;

    const user = await this.projectUserStore.getByProjectIdAndEmail({
      projectId: params.projectId,
      userEmail: params.currentUserEmail,
    });
    if (!user) return false;
    return user.role === 'admin' || user.role === 'maintainer';
  }

  async canDeleteProject(
    ctx: Context,
    params: {projectId: string; currentUserEmail: NormalizedEmail},
  ): Promise<boolean> {
    const isOrgMember = await this.isOrganizationMember(ctx, {
      projectId: params.projectId,
      currentUserEmail: params.currentUserEmail,
    });
    if (!isOrgMember) return false;

    const user = await this.projectUserStore.getByProjectIdAndEmail({
      projectId: params.projectId,
      userEmail: params.currentUserEmail,
    });
    if (!user) return false;
    return user.role === 'admin';
  }

  async canEditProjectConfigs(
    ctx: Context,
    params: {projectId: string; currentUserEmail: NormalizedEmail},
  ): Promise<boolean> {
    const isOrgMember = await this.isOrganizationMember(ctx, {
      projectId: params.projectId,
      currentUserEmail: params.currentUserEmail,
    });
    if (!isOrgMember) return false;

    const user = await this.projectUserStore.getByProjectIdAndEmail({
      projectId: params.projectId,
      userEmail: params.currentUserEmail,
    });
    if (!user) return false;
    return user.role === 'admin' || user.role === 'maintainer';
  }

  async canManageProjectConfigs(
    ctx: Context,
    params: {projectId: string; currentUserEmail: NormalizedEmail},
  ): Promise<boolean> {
    const isOrgMember = await this.isOrganizationMember(ctx, {
      projectId: params.projectId,
      currentUserEmail: params.currentUserEmail,
    });
    if (!isOrgMember) return false;

    const user = await this.projectUserStore.getByProjectIdAndEmail({
      projectId: params.projectId,
      userEmail: params.currentUserEmail,
    });
    if (!user) return false;
    return user.role === 'admin' || user.role === 'maintainer';
  }

  async canManageProjectUsers(
    ctx: Context,
    params: {projectId: string; currentUserEmail: NormalizedEmail},
  ): Promise<boolean> {
    const isOrgMember = await this.isOrganizationMember(ctx, {
      projectId: params.projectId,
      currentUserEmail: params.currentUserEmail,
    });
    if (!isOrgMember) return false;

    const user = await this.projectUserStore.getByProjectIdAndEmail({
      projectId: params.projectId,
      userEmail: params.currentUserEmail,
    });
    if (!user) return false;
    return user.role === 'admin';
  }

  async canManageProjectEnvironments(
    ctx: Context,
    params: {projectId: string; currentUserEmail: NormalizedEmail},
  ): Promise<boolean> {
    const isOrgMember = await this.isOrganizationMember(ctx, {
      projectId: params.projectId,
      currentUserEmail: params.currentUserEmail,
    });
    if (!isOrgMember) return false;

    const user = await this.projectUserStore.getByProjectIdAndEmail({
      projectId: params.projectId,
      userEmail: params.currentUserEmail,
    });
    if (!user) return false;
    return user.role === 'admin';
  }

  async canCreateConfig(
    ctx: Context,
    params: {projectId: string; currentUserEmail: NormalizedEmail},
  ): Promise<boolean> {
    const isOrgMember = await this.isOrganizationMember(ctx, {
      projectId: params.projectId,
      currentUserEmail: params.currentUserEmail,
    });
    if (!isOrgMember) return false;

    return await this.canManageProjectConfigs(ctx, params);
  }

  async isOrganizationMember(
    ctx: Context,
    params:
      | {projectId: string; currentUserEmail: NormalizedEmail}
      | {organizationId: string; currentUserEmail: NormalizedEmail},
  ): Promise<boolean> {
    if ('projectId' in params) {
      // Check if user is a member of the project's organization
      const project = await this.projectStore.getById({
        id: params.projectId,
        currentUserEmail: params.currentUserEmail,
      });
      if (!project) return false;

      const orgMember = await this.organizationMemberStore.getByOrganizationIdAndEmail({
        organizationId: project.organizationId,
        userEmail: params.currentUserEmail,
      });

      if (!orgMember) {
        // Check if user has explicit project role
        const user = await this.projectUserStore.getByProjectIdAndEmail({
          projectId: params.projectId,
          userEmail: params.currentUserEmail,
        });
        if (user) {
          // this should never happen
          this.logger.error(ctx, {
            msg: `User ${params.currentUserEmail} is not a member of organization ${project.organizationId} but has explicit project role`,
          });
        }
      }

      return !!orgMember;
    } else {
      const member = await this.organizationMemberStore.getByOrganizationIdAndEmail({
        organizationId: params.organizationId,
        userEmail: params.currentUserEmail,
      });
      return !!member;
    }
  }

  async isOrganizationAdmin(
    ctx: Context,
    params: {organizationId: string; currentUserEmail: NormalizedEmail},
  ): Promise<boolean> {
    const member = await this.organizationMemberStore.getByOrganizationIdAndEmail({
      organizationId: params.organizationId,
      userEmail: params.currentUserEmail,
    });
    return member?.role === 'admin';
  }
  async ensureCanEditConfig(
    ctx: Context,
    params: {configId: string; currentUserEmail: NormalizedEmail},
  ): Promise<void> {
    const canEdit = await this.canEditConfig(ctx, params);
    if (!canEdit) {
      throw new ForbiddenError('User does not have permission to edit this config');
    }
  }

  async ensureCanManageConfig(
    ctx: Context,
    params: {configId: string; currentUserEmail: NormalizedEmail},
  ): Promise<void> {
    const canManage = await this.canManageConfig(ctx, params);
    if (!canManage) {
      throw new ForbiddenError('User does not have permission to manage this config');
    }
  }

  async ensureCanManageApiKeys(
    ctx: Context,
    params: {projectId: string; currentUserEmail: NormalizedEmail},
  ): Promise<void> {
    const canManage = await this.canManageProjectApiKeys(ctx, params);
    if (!canManage) {
      throw new ForbiddenError('User does not have permission to manage SDK keys for this project');
    }
  }

  async ensureCanManageProject(
    ctx: Context,
    params: {projectId: string; currentUserEmail: NormalizedEmail},
  ): Promise<void> {
    const canManage = await this.canManageProject(ctx, params);
    if (!canManage) {
      throw new ForbiddenError('User does not have permission to manage this project');
    }
  }

  async ensureCanManageProjectUsers(
    ctx: Context,
    params: {projectId: string; currentUserEmail: NormalizedEmail},
  ): Promise<void> {
    const canManage = await this.canManageProjectUsers(ctx, params);
    if (!canManage) {
      throw new ForbiddenError('User does not have permission to manage users for this project');
    }
  }

  async ensureCanManageProjectEnvironments(
    ctx: Context,
    params: {projectId: string; currentUserEmail: NormalizedEmail},
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
    params: {projectId: string; currentUserEmail: NormalizedEmail},
  ): Promise<void> {
    const canCreate = await this.canCreateConfig(ctx, params);
    if (!canCreate) {
      throw new ForbiddenError('User does not have permission to create configs in this project');
    }
  }

  async ensureCanDeleteProject(
    ctx: Context,
    params: {projectId: string; currentUserEmail: NormalizedEmail},
  ): Promise<void> {
    const canDelete = await this.canDeleteProject(ctx, params);
    if (!canDelete) {
      throw new ForbiddenError('User does not have permission to delete this project');
    }
  }

  async ensureIsOrganizationMember(
    ctx: Context,
    params:
      | {projectId: string; currentUserEmail: NormalizedEmail}
      | {organizationId: string; currentUserEmail: NormalizedEmail},
  ): Promise<void> {
    const canView = await this.isOrganizationMember(ctx, params);
    if (!canView) {
      throw new ForbiddenError('User does not have permission to view this project');
    }
  }

  async ensureIsOrganizationAdmin(
    ctx: Context,
    params: {organizationId: string; currentUserEmail: NormalizedEmail},
  ): Promise<void> {
    const isAdmin = await this.isOrganizationAdmin(ctx, params);
    if (!isAdmin) {
      throw new ForbiddenError('User is not an admin of this organization');
    }
  }
}
