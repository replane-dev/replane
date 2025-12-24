import type {AdminApiKeyScope} from '../db';
import type {Identity} from '../identity';
import type {TransactionalUseCase} from '../use-case';

export interface ListAdminApiKeysRequest {
  identity: Identity;
  workspaceId: string;
}

export interface AdminApiKeyInfo {
  id: string;
  name: string;
  description: string;
  keyPrefix: string;
  keySuffix: string;
  createdByEmail: string;
  createdAt: Date;
  lastUsedAt: Date | null;
  expiresAt: Date | null;
  scopes: AdminApiKeyScope[];
  projectIds: string[] | null;
}

export interface ListAdminApiKeysResponse {
  adminApiKeys: AdminApiKeyInfo[];
}

export function createListAdminApiKeysUseCase(): TransactionalUseCase<
  ListAdminApiKeysRequest,
  ListAdminApiKeysResponse
> {
  return async (ctx, tx, req) => {
    // Only workspace admins can list API keys
    await tx.permissionService.ensureIsWorkspaceAdmin(ctx, {
      workspaceId: req.workspaceId,
      identity: req.identity,
    });

    const keys = await tx.adminApiKeys.listByWorkspace(req.workspaceId);

    return {
      adminApiKeys: keys.map(key => ({
        id: key.id,
        name: key.name,
        description: key.description,
        keyPrefix: key.keyPrefix,
        keySuffix: key.keySuffix,
        createdByEmail: key.createdByEmail,
        createdAt: key.createdAt,
        lastUsedAt: key.lastUsedAt,
        expiresAt: key.expiresAt,
        scopes: key.scopes,
        projectIds: key.projectIds,
      })),
    };
  };
}

