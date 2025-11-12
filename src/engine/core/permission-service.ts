import type {ConfigStore} from './config-store';
import type {ConfigUserStore} from './config-user-store';
import {ForbiddenError} from './errors';
import type {ProjectUserStore} from './project-user-store';
import {unique} from './utils';
import type {NormalizedEmail} from './zod';

export class PermissionService {
  constructor(
    private readonly configUserStore: ConfigUserStore,
    private readonly projectUserStore: ProjectUserStore,
    private readonly configStore: ConfigStore,
  ) {}

  async getConfigOwners(configId: string): Promise<string[]> {
    const config = await this.configStore.getById(configId);
    if (!config) return [];

    const configUsers = await this.configUserStore.getByConfigId(configId);
    const projectUsers = await this.projectUserStore.getByProjectId(config.projectId);

    const configOwnerEmails = configUsers
      .filter(cu => cu.role === 'owner')
      .map(cu => cu.user_email_normalized)
      .filter(Boolean) as string[];

    const projectOwnerEmails = projectUsers
      .filter(pu => pu.role === 'owner' || pu.role === 'admin')
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
      .filter(cu => cu.role === 'editor' || cu.role === 'owner')
      .map(cu => cu.user_email_normalized)
      .filter(Boolean) as string[];

    const projectOwnerEmails = projectUsers
      .filter(pu => pu.role === 'owner' || pu.role === 'admin')
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
      configUser?.role === 'owner' ||
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
      user?.role === 'owner' ||
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
    return user.role === 'owner' || user.role === 'admin';
  }

  async canManageProject(projectId: string, currentUserEmail: NormalizedEmail): Promise<boolean> {
    const user = await this.projectUserStore.getByProjectIdAndEmail({
      projectId,
      userEmail: currentUserEmail,
    });
    if (!user) return false;
    return user.role === 'owner' || user.role === 'admin';
  }

  async canDeleteProject(projectId: string, currentUserEmail: NormalizedEmail): Promise<boolean> {
    const user = await this.projectUserStore.getByProjectIdAndEmail({
      projectId,
      userEmail: currentUserEmail,
    });
    if (!user) return false;
    return user.role === 'owner';
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
    return user.role === 'owner' || user.role === 'admin';
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
    return user.role === 'owner' || user.role === 'admin';
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
    return user.role === 'owner';
  }

  async canCreateConfigInProject(
    projectId: string,
    currentUserEmail: NormalizedEmail,
  ): Promise<boolean> {
    return await this.canManageProjectConfigs(projectId, currentUserEmail);
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
      throw new ForbiddenError('User does not have permission to manage API keys for this project');
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
}
