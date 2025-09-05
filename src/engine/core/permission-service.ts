import type {ConfigUserStore} from './config-user-store';
import {ForbiddenError} from './errors';

export class PermissionService {
  constructor(private readonly configUserStore: ConfigUserStore) {}

  async canEditConfig(configId: string, currentUserEmail: string): Promise<boolean> {
    const user = await this.configUserStore.getByConfigIdAndEmail({
      configId,
      userEmail: currentUserEmail,
    });
    if (!user) return false;
    return user.role === 'editor' || user.role === 'owner';
  }

  async canManageConfig(configId: string, currentUserEmail: string): Promise<boolean> {
    const user = await this.configUserStore.getByConfigIdAndEmail({
      configId,
      userEmail: currentUserEmail,
    });
    if (!user) return false;
    return user.role === 'owner';
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
}
