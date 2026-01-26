import {BadRequestError} from '../errors';
import {getUserIdFromIdentity, type Identity} from '../identity';
import {createAuditLogId} from '../stores/audit-log-store';
import type {TransactionalUseCase} from '../use-case';

export interface UpdateSdkKeyRequest {
  id: string;
  projectId: string;
  description: string;
  identity: Identity;
}

export interface UpdateSdkKeyResponse {}

export function createUpdateSdkKeyUseCase(): TransactionalUseCase<
  UpdateSdkKeyRequest,
  UpdateSdkKeyResponse
> {
  return async (ctx, tx, req) => {
    const sdkKey = await tx.sdkKeys.getById({
      sdkKeyId: req.id,
      projectId: req.projectId,
    });
    if (!sdkKey) {
      throw new BadRequestError('SDK key not found');
    }

    await tx.permissionService.ensureCanManageSdkKeys(ctx, {
      projectId: sdkKey.projectId,
      identity: req.identity,
    });

    const previousDescription = sdkKey.description;

    await tx.sdkKeys.updateById(ctx, {
      id: sdkKey.id,
      projectId: req.projectId,
      description: req.description,
    });

    await tx.auditLogs.create({
      id: createAuditLogId(),
      createdAt: new Date(),
      projectId: sdkKey.projectId,
      userId: getUserIdFromIdentity(req.identity),
      configId: null,
      payload: {
        type: 'sdk_key_updated',
        sdkKey: {
          id: sdkKey.id,
          name: sdkKey.name,
          createdAt: sdkKey.createdAt,
        },
        before: {
          description: previousDescription,
        },
        after: {
          description: req.description,
        },
      },
    });
    return {};
  };
}
