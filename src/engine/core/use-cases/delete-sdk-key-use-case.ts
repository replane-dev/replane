import {BadRequestError} from '../errors';
import {requireUserEmail, type Identity} from '../identity';
import {createAuditLogId} from '../stores/audit-log-store';
import type {TransactionalUseCase} from '../use-case';

export interface DeleteSdkKeyRequest {
  id: string;
  projectId: string;
  identity: Identity;
}

export interface DeleteSdkKeyResponse {}

export function createDeleteSdkKeyUseCase(): TransactionalUseCase<
  DeleteSdkKeyRequest,
  DeleteSdkKeyResponse
> {
  return async (ctx, tx, req) => {
    // This operation requires a user identity
    const currentUserEmail = requireUserEmail(req.identity);

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

    const user = await tx.users.getByEmail(currentUserEmail);
    if (!user) {
      throw new BadRequestError('User not found');
    }

    await tx.sdkKeys.deleteById(ctx, sdkKey.id);
    await tx.auditLogs.create({
      id: createAuditLogId(),
      createdAt: new Date(),
      projectId: sdkKey.projectId,
      userId: user.id,
      configId: null,
      payload: {
        type: 'sdk_key_deleted',
        sdkKey: {
          id: sdkKey.id,
          name: sdkKey.name,
          description: sdkKey.description,
          createdAt: sdkKey.createdAt,
        },
      },
    });
    return {};
  };
}
