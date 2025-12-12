import {BadRequestError} from '../errors';
import {createAuditLogId} from '../stores/audit-log-store';
import type {TransactionalUseCase} from '../use-case';
import type {NormalizedEmail} from '../zod';

export interface DeleteSdkKeyRequest {
  id: string;
  projectId: string;
  currentUserEmail: NormalizedEmail;
}

export interface DeleteSdkKeyResponse {}

export function createDeleteSdkKeyUseCase(): TransactionalUseCase<
  DeleteSdkKeyRequest,
  DeleteSdkKeyResponse
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
      currentUserEmail: req.currentUserEmail,
    });

    const user = await tx.users.getByEmail(req.currentUserEmail);
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
