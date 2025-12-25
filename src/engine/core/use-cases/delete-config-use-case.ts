import {BadRequestError, NotFoundError} from '../errors';
import {isApiKeyIdentity, type Identity} from '../identity';
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

    // When requireProposals is enabled, forbid direct deletions for user identities.
    // API key identities bypass the proposal requirement.
    if (project.requireProposals && !isApiKeyIdentity(req.identity)) {
      throw new BadRequestError(
        'Direct config deletion is disabled. Please use the proposal workflow instead.',
      );
    }

    await tx.configService.deleteConfig(ctx, {
      configId: config.id,
      identity: req.identity,
      prevVersion: req.prevVersion ?? config.version,
    });

    return {};
  };
}
