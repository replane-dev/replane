import type {ConfigStore} from './config-store';
import type {ConfigUserStore} from './config-user-store';
import {ForbiddenError} from './errors';
import type {OrganizationMemberStore} from './organization-member-store';
import type {ProjectStore} from './project-store';
import type {ProjectUserStore} from './project-user-store';
import {unique} from './utils';
import type {NormalizedEmail} from './zod';

export class PermissionService {
  constructor(
    private readonly configUserStore: ConfigUserStore,
    private readonly projectUserStore: ProjectUserStore,
    private readonly configStore: ConfigStore,
    private readonly projectStore: ProjectStore,
    private readonly organizationMemberStore: OrganizationMemberStore,
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

  async canEditConfig(configId: string, currentUserEmail: NormalizedEmail): Promise<boolean> {
    const config = await this.configStore.getById(configId);
    if (!config) return false;

    const configUser = await this.configUserStore.getByConfigIdAndEmail({
      configId,
      userEmail: currentUserEmail,
    });
    return (
      configUser?.role === 'editor' ||
      configUser?.role === 'maintainer' ||
      (await this.canEditProjectConfigs(config.projectId, currentUserEmail))
    );
  }

  async canManageConfig(configId: string, currentUserEmail: NormalizedEmail): Promise<boolean> {
    const config = await this.configStore.getById(configId);
    if (!config) return false;

    const user = await this.configUserStore.getByConfigIdAndEmail({
      configId,
      userEmail: currentUserEmail,
    });
    return (
      user?.role === 'maintainer' ||
      (await this.canManageProjectConfigs(config.projectId, currentUserEmail))
    );
  }

  async canManageProjectApiKeys(
    projectId: string,
    currentUserEmail: NormalizedEmail,
  ): Promise<boolean> {
    const user = await this.projectUserStore.getByProjectIdAndEmail({
      projectId,
      userEmail: currentUserEmail,
    });
    if (!user) return false;
    return user.role === 'admin' || user.role === 'maintainer';
  }

  async canManageProject(projectId: string, currentUserEmail: NormalizedEmail): Promise<boolean> {
    const user = await this.projectUserStore.getByProjectIdAndEmail({
      projectId,
      userEmail: currentUserEmail,
    });
    if (!user) return false;
    return user.role === 'admin' || user.role === 'maintainer';
  }

  async canDeleteProject(projectId: string, currentUserEmail: NormalizedEmail): Promise<boolean> {
    const user = await this.projectUserStore.getByProjectIdAndEmail({
      projectId,
      userEmail: currentUserEmail,
    });
    if (!user) return false;
    return user.role === 'admin';
  }

  async canEditProjectConfigs(
    projectId: string,
    currentUserEmail: NormalizedEmail,
  ): Promise<boolean> {
    const user = await this.projectUserStore.getByProjectIdAndEmail({
      projectId,
      userEmail: currentUserEmail,
    });
    if (!user) return false;
    return user.role === 'admin' || user.role === 'maintainer';
  }

  async canManageProjectConfigs(
    projectId: string,
    currentUserEmail: NormalizedEmail,
  ): Promise<boolean> {
    const user = await this.projectUserStore.getByProjectIdAndEmail({
      projectId,
      userEmail: currentUserEmail,
    });
    if (!user) return false;
    return user.role === 'admin' || user.role === 'maintainer';
  }

  async canManageProjectUsers(
    projectId: string,
    currentUserEmail: NormalizedEmail,
  ): Promise<boolean> {
    const user = await this.projectUserStore.getByProjectIdAndEmail({
      projectId,
      userEmail: currentUserEmail,
    });
    if (!user) return false;
    return user.role === 'admin';
  }

  async canCreateConfigInProject(
    projectId: string,
    currentUserEmail: NormalizedEmail,
  ): Promise<boolean> {
    return await this.canManageProjectConfigs(projectId, currentUserEmail);
  }

  async canViewProject(projectId: string, currentUserEmail: NormalizedEmail): Promise<boolean> {
    // Check if user has explicit project role
    const user = await this.projectUserStore.getByProjectIdAndEmail({
      projectId,
      userEmail: currentUserEmail,
    });
    if (user) return true;

    // Check if user is a member of the project's organization
    const project = await this.projectStore.getById({
      id: projectId,
      currentUserEmail,
    });
    if (!project) return false;

    const orgMember = await this.organizationMemberStore.getByOrganizationIdAndEmail({
      organizationId: project.organizationId,
      userEmail: currentUserEmail,
    });

    return !!orgMember;
  }

  async canViewConfig(configId: string, currentUserEmail: NormalizedEmail): Promise<boolean> {
    const config = await this.configStore.getById(configId);
    if (!config) return false;

    return await this.canViewProject(config.projectId, currentUserEmail);
  }

  async isOrganizationMember(
    organizationId: string,
    currentUserEmail: NormalizedEmail,
  ): Promise<boolean> {
    const member = await this.organizationMemberStore.getByOrganizationIdAndEmail({
      organizationId,
      userEmail: currentUserEmail,
    });
    return !!member;
  }

  async isOrganizationAdmin(
    organizationId: string,
    currentUserEmail: NormalizedEmail,
  ): Promise<boolean> {
    const member = await this.organizationMemberStore.getByOrganizationIdAndEmail({
      organizationId,
      userEmail: currentUserEmail,
    });
    return member?.role === 'admin';
  }

  async ensureCanEditConfig(configId: string, currentUserEmail: NormalizedEmail): Promise<void> {
    const canEdit = await this.canEditConfig(configId, currentUserEmail);
    if (!canEdit) {
      throw new ForbiddenError('User does not have permission to edit this config');
    }
  }

  async ensureCanManageConfig(configId: string, currentUserEmail: NormalizedEmail): Promise<void> {
    const canManage = await this.canManageConfig(configId, currentUserEmail);
    if (!canManage) {
      throw new ForbiddenError('User does not have permission to manage this config');
    }
  }

  async ensureCanManageApiKeys(
    projectId: string,
    currentUserEmail: NormalizedEmail,
  ): Promise<void> {
    const canManage = await this.canManageProjectApiKeys(projectId, currentUserEmail);
    if (!canManage) {
      throw new ForbiddenError('User does not have permission to manage SDK keys for this project');
    }
  }

  async ensureCanManageProject(
    projectId: string,
    currentUserEmail: NormalizedEmail,
  ): Promise<void> {
    const canManage = await this.canManageProject(projectId, currentUserEmail);
    if (!canManage) {
      throw new ForbiddenError('User does not have permission to manage this project');
    }
  }

  async ensureCanManageProjectUsers(
    projectId: string,
    currentUserEmail: NormalizedEmail,
  ): Promise<void> {
    const canManage = await this.canManageProjectUsers(projectId, currentUserEmail);
    if (!canManage) {
      throw new ForbiddenError('User does not have permission to manage users for this project');
    }
  }

  async ensureCanCreateConfig(projectId: string, currentUserEmail: NormalizedEmail): Promise<void> {
    const canCreate = await this.canCreateConfigInProject(projectId, currentUserEmail);
    if (!canCreate) {
      throw new ForbiddenError('User does not have permission to create configs in this project');
    }
  }

  async ensureCanDeleteProject(
    projectId: string,
    currentUserEmail: NormalizedEmail,
  ): Promise<void> {
    const canDelete = await this.canDeleteProject(projectId, currentUserEmail);
    if (!canDelete) {
      throw new ForbiddenError('User does not have permission to delete this project');
    }
  }

  async ensureCanViewProject(
    projectId: string,
    currentUserEmail: NormalizedEmail,
  ): Promise<void> {
    const canView = await this.canViewProject(projectId, currentUserEmail);
    if (!canView) {
      throw new ForbiddenError('User does not have permission to view this project');
    }
  }

  async ensureCanViewConfig(configId: string, currentUserEmail: NormalizedEmail): Promise<void> {
    const canView = await this.canViewConfig(configId, currentUserEmail);
    if (!canView) {
      throw new ForbiddenError('User does not have permission to view this config');
    }
  }

  async ensureIsOrganizationMember(
    organizationId: string,
    currentUserEmail: NormalizedEmail,
  ): Promise<void> {
    const isMember = await this.isOrganizationMember(organizationId, currentUserEmail);
    if (!isMember) {
      throw new ForbiddenError('User is not a member of this organization');
    }
  }

  async ensureIsOrganizationAdmin(
    organizationId: string,
    currentUserEmail: NormalizedEmail,
  ): Promise<void> {
    const isAdmin = await this.isOrganizationAdmin(organizationId, currentUserEmail);
    if (!isAdmin) {
      throw new ForbiddenError('User is not an admin of this organization');
    }
  }
}
