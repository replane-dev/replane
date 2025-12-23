import {BadRequestError, NotFoundError} from '../errors';
import {getAuditIdentityInfo, type Identity} from '../identity';
import type {TransactionalUseCase} from '../use-case';

export interface DeleteConfigRequest {
  projectId: string;
  configName: string;
  identity: Identity;
  /** Previous version for optimistic locking. If not provided, uses current config version. */
  prevVersion?: number;
}

export interface DeleteConfigResponse {}

export function createDeleteConfigUseCase(): TransactionalUseCase<
  DeleteConfigRequest,
  DeleteConfigResponse
> {
  return async (ctx, tx, req) => {
    const auditInfo = getAuditIdentityInfo(req.identity);

    // Look up config by projectId + configName
    const config = await tx.configs.getByName({
      projectId: req.projectId,
      name: req.configName,
    });
    if (!config) {
      throw new NotFoundError('Config not found');
    }

    // Check permission
    await tx.permissionService.ensureCanManageConfig(ctx, {
      configId: config.id,
      identity: req.identity,
    });

    const project = await tx.projects.getByIdWithoutPermissionCheck(config.projectId);
    if (!project) {
      throw new BadRequestError('Project not found');
    }

    // When requireProposals is enabled, forbid direct deletions.
    // Users should use the proposal workflow instead of deleting configs outright.
    if (project.requireProposals) {
      throw new BadRequestError(
        'Direct config deletion is disabled. Please use the proposal workflow instead.',
      );
    }

    // Get user for audit log (null for API key)
    let userId: number | null = null;
    if (auditInfo.userEmail) {
      const currentUser = await tx.users.getByEmail(auditInfo.userEmail);
      if (!currentUser) {
        throw new BadRequestError('User not found');
      }
      userId = currentUser.id;
    }

    await tx.configService.deleteConfigDirect(ctx, {
      configId: config.id,
      userId,
      prevVersion: req.prevVersion ?? config.version,
    });

    return {};
  };
}
