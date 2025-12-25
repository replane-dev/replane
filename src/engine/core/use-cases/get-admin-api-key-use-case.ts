import type {AdminApiKeyScope} from '../db';
import {ForbiddenError} from '../errors';
import type {Identity} from '../identity';
import type {TransactionalUseCase} from '../use-case';

export interface GetAdminApiKeyRequest {
  identity: Identity;
  workspaceId: string;
  adminApiKeyId: string;
}

export interface GetAdminApiKeyResponse {
  adminApiKey: {
    id: string;
    name: string;
    description: string;
    keyPrefix: string;
    createdByEmail: string;
    createdAt: Date;
    updatedAt: Date;
    lastUsedAt: Date | null;
    expiresAt: Date | null;
    scopes: AdminApiKeyScope[];
    projectIds: string[] | null;
  } | null;
}

export function createGetAdminApiKeyUseCase(): TransactionalUseCase<
  GetAdminApiKeyRequest,
  GetAdminApiKeyResponse
> {
  return async (ctx, tx, req) => {
    // Only workspace admins can view API key details
    await tx.permissionService.ensureIsWorkspaceAdmin(ctx, {
      workspaceId: req.workspaceId,
      identity: req.identity,
    });

    const key = await tx.adminApiKeys.getById(req.adminApiKeyId);

    if (!key || key.workspaceId !== req.workspaceId) {
      return {adminApiKey: null};
    }

    return {
      adminApiKey: {
        id: key.id,
        name: key.name,
        description: key.description,
        keyPrefix: key.keyPrefix,
        createdByEmail: key.createdByEmail,
        createdAt: key.createdAt,
        updatedAt: key.updatedAt,
        lastUsedAt: key.lastUsedAt,
        expiresAt: key.expiresAt,
        scopes: key.scopes,
        projectIds: key.projectIds,
      },
    };
  };
}

