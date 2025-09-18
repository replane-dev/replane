import type {ConfigStore} from './config-store';
import type {ConfigUserStore} from './config-user-store';
import {ForbiddenError} from './errors';
import type {ProjectUserStore} from './project-user-store';

export class PermissionService {
  constructor(
    private readonly configUserStore: ConfigUserStore,
    private readonly projectUserStore: ProjectUserStore,
    private readonly configStore: ConfigStore,
  ) {}

  async canEditConfig(configId: string, currentUserEmail: string): Promise<boolean> {
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

  async canManageConfig(configId: string, currentUserEmail: string): Promise<boolean> {
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

  async canManageProjectApiKeys(projectId: string, currentUserEmail: string): Promise<boolean> {
    const user = await this.projectUserStore.getByProjectIdAndEmail({
      projectId,
      userEmail: currentUserEmail,
    });
    if (!user) return false;
    return user.role === 'owner' || user.role === 'admin';
  }

  async canManageProject(projectId: string, currentUserEmail: string): Promise<boolean> {
    const user = await this.projectUserStore.getByProjectIdAndEmail({
      projectId,
      userEmail: currentUserEmail,
    });
    if (!user) return false;
    return user.role === 'owner' || user.role === 'admin';
  }

  async canDeleteProject(projectId: string, currentUserEmail: string): Promise<boolean> {
    const user = await this.projectUserStore.getByProjectIdAndEmail({
      projectId,
      userEmail: currentUserEmail,
    });
    if (!user) return false;
    return user.role === 'owner';
  }

  async canEditProjectConfigs(projectId: string, currentUserEmail: string): Promise<boolean> {
    const user = await this.projectUserStore.getByProjectIdAndEmail({
      projectId,
      userEmail: currentUserEmail,
    });
    if (!user) return false;
    return user.role === 'owner' || user.role === 'admin';
  }

  async canManageProjectConfigs(projectId: string, currentUserEmail: string): Promise<boolean> {
    const user = await this.projectUserStore.getByProjectIdAndEmail({
      projectId,
      userEmail: currentUserEmail,
    });
    if (!user) return false;
    return user.role === 'owner' || user.role === 'admin';
  }

  async canManageProjectUsers(projectId: string, currentUserEmail: string): Promise<boolean> {
    const user = await this.projectUserStore.getByProjectIdAndEmail({
      projectId,
      userEmail: currentUserEmail,
    });
    if (!user) return false;
    return user.role === 'owner';
  }

  async canCreateConfigInProject(projectId: string, currentUserEmail: string): Promise<boolean> {
    return await this.canManageProjectConfigs(projectId, currentUserEmail);
  }

  async ensureCanEditConfig(configId: string, currentUserEmail: string): Promise<void> {
    const canEdit = await this.canEditConfig(configId, currentUserEmail);
    if (!canEdit) {
      throw new ForbiddenError('User does not have permission to edit this config');
    }
  }

  async ensureCanManageConfig(configId: string, currentUserEmail: string): Promise<void> {
    const canManage = await this.canManageConfig(configId, currentUserEmail);
    if (!canManage) {
      throw new ForbiddenError('User does not have permission to manage this config');
    }
  }

  async ensureCanManageApiKeys(projectId: string, currentUserEmail: string): Promise<void> {
    const canManage = await this.canManageProjectApiKeys(projectId, currentUserEmail);
    if (!canManage) {
      throw new ForbiddenError('User does not have permission to manage API keys for this project');
    }
  }

  async ensureCanManageProject(projectId: string, currentUserEmail: string): Promise<void> {
    const canManage = await this.canManageProject(projectId, currentUserEmail);
    if (!canManage) {
      throw new ForbiddenError('User does not have permission to manage this project');
    }
  }

  async ensureCanManageProjectUsers(projectId: string, currentUserEmail: string): Promise<void> {
    const canManage = await this.canManageProjectUsers(projectId, currentUserEmail);
    if (!canManage) {
      throw new ForbiddenError('User does not have permission to manage users for this project');
    }
  }

  async ensureCanCreateConfig(projectId: string, currentUserEmail: string): Promise<void> {
    const canCreate = await this.canCreateConfigInProject(projectId, currentUserEmail);
    if (!canCreate) {
      throw new ForbiddenError('User does not have permission to create configs in this project');
    }
  }

  async ensureCanDeleteProject(projectId: string, currentUserEmail: string): Promise<void> {
    const canDelete = await this.canDeleteProject(projectId, currentUserEmail);
    if (!canDelete) {
      throw new ForbiddenError('User does not have permission to delete this project');
    }
  }
}
