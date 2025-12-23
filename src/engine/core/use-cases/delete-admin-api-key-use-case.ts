import {ForbiddenError} from '../errors';
import {requireUserEmail, type Identity} from '../identity';
import {createAuditLogId} from '../stores/audit-log-store';
import type {TransactionalUseCase} from '../use-case';

export interface DeleteAdminApiKeyRequest {
  identity: Identity;
  workspaceId: string;
  adminApiKeyId: string;
}

export interface DeleteAdminApiKeyResponse {
  success: boolean;
}

export function createDeleteAdminApiKeyUseCase(): TransactionalUseCase<
  DeleteAdminApiKeyRequest,
  DeleteAdminApiKeyResponse
> {
  return async (ctx, tx, req) => {
    // This operation requires a user identity
    const currentUserEmail = requireUserEmail(req.identity);

    // Only workspace admins can delete API keys
    await tx.permissionService.ensureIsWorkspaceAdmin(ctx, {
      workspaceId: req.workspaceId,
      identity: req.identity,
    });

    const user = await tx.users.getByEmail(currentUserEmail);
    if (!user) {
      throw new Error('User not found');
    }

    // Verify the key exists and belongs to this workspace
    const key = await tx.adminApiKeys.getById(req.adminApiKeyId);
    if (!key || key.workspaceId !== req.workspaceId) {
      throw new ForbiddenError('Admin API key not found');
    }

    await tx.adminApiKeys.deleteById(req.adminApiKeyId);

    await tx.auditLogs.create({
      id: createAuditLogId(),
      createdAt: new Date(),
      userId: user.id,
      projectId: null,
      configId: null,
      payload: {
        type: 'admin_api_key_deleted',
        adminApiKey: {
          id: key.id,
          name: key.name,
          workspaceId: key.workspaceId,
        },
      },
    });

    return {success: true};
  };
}

