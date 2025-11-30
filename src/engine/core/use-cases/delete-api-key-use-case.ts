import {BadRequestError} from '../errors';
import {createAuditLogId} from '../stores/audit-log-store';
import type {TransactionalUseCase} from '../use-case';
import type {NormalizedEmail} from '../zod';

export interface DeleteApiKeyRequest {
  id: string;
  projectId: string;
  currentUserEmail: NormalizedEmail;
}

export interface DeleteApiKeyResponse {}

export function createDeleteApiKeyUseCase(): TransactionalUseCase<
  DeleteApiKeyRequest,
  DeleteApiKeyResponse
> {
  return async (ctx, tx, req) => {
    const sdkKey = await tx.sdkKeys.getById({
      apiKeyId: req.id,
      projectId: req.projectId,
    });
    if (!sdkKey) {
      throw new BadRequestError('SDK key not found');
    }

    await tx.permissionService.ensureCanManageApiKeys(ctx, {
      projectId: sdkKey.projectId,
      currentUserEmail: req.currentUserEmail,
    });

    // Only allow creator to delete for now
    const user = await tx.users.getByEmail(req.currentUserEmail);
    if (!user || user.id !== sdkKey.creatorId) {
      throw new Error('Not allowed to delete this SDK key');
    }
    await tx.sdkKeys.deleteById(sdkKey.id);
    await tx.auditLogs.create({
      id: createAuditLogId(),
      createdAt: new Date(),
      projectId: sdkKey.projectId,
      userId: user.id,
      configId: null,
      payload: {
        type: 'api_key_deleted',
        apiKey: {
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
