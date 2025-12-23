import {BadRequestError} from '../errors';
import {getAuditIdentityInfo, type Identity} from '../identity';
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
    const auditInfo = getAuditIdentityInfo(req.identity);

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

    // Get user ID for audit log (null for API key)
    let userId: number | null = null;
    if (auditInfo.userEmail) {
      const user = await tx.users.getByEmail(auditInfo.userEmail);
      if (!user) {
        throw new BadRequestError('User not found');
      }
      userId = user.id;
    }

    await tx.sdkKeys.deleteById(ctx, sdkKey.id);
    await tx.auditLogs.create({
      id: createAuditLogId(),
      createdAt: new Date(),
      projectId: sdkKey.projectId,
      userId,
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
