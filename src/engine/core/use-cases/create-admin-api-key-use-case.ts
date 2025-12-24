import {
  buildRawAdminApiKey,
  getAdminApiKeyPrefix,
  getAdminApiKeySuffix,
  hashAdminApiKey,
} from '../admin-api-key-utils';
import type {AdminApiKeyScope} from '../db';
import {requireUserEmail, type Identity} from '../identity';
import {createAuditLogId} from '../stores/audit-log-store';
import type {TransactionalUseCase} from '../use-case';
import {createUuidV7} from '../uuid';

export interface CreateAdminApiKeyRequest {
  identity: Identity;
  workspaceId: string;
  name: string;
  description: string;
  scopes: AdminApiKeyScope[];
  /** Project IDs to restrict access to. Null means all projects in the workspace. */
  projectIds: string[] | null;
  expiresAt: Date | null;
}

export interface CreateAdminApiKeyResponse {
  adminApiKey: {
    id: string;
    name: string;
    description: string;
    keyPrefix: string;
    createdAt: Date;
    scopes: AdminApiKeyScope[];
    projectIds: string[] | null;
    expiresAt: Date | null;
    /** Full token - shown only once */
    token: string;
  };
}

export function createCreateAdminApiKeyUseCase(): TransactionalUseCase<
  CreateAdminApiKeyRequest,
  CreateAdminApiKeyResponse
> {
  return async (ctx, tx, req) => {
    // This operation requires a user identity (only users can create API keys)
    const currentUserEmail = requireUserEmail(req.identity);

    // Only workspace admins can create API keys
    await tx.permissionService.ensureIsWorkspaceAdmin(ctx, {
      workspaceId: req.workspaceId,
      identity: req.identity,
    });

    const user = await tx.users.getByEmail(currentUserEmail);
    if (!user) {
      throw new Error('User not found');
    }

    // Validate that all project IDs belong to the workspace
    if (req.projectIds !== null && req.projectIds.length > 0) {
      for (const projectId of req.projectIds) {
        const project = await tx.projects.getByIdWithoutPermissionCheck(projectId);
        if (!project || project.workspaceId !== req.workspaceId) {
          throw new Error(`Project ${projectId} not found in workspace`);
        }
      }
    }

    const keyId = createUuidV7();
    const rawKey = buildRawAdminApiKey(keyId);
    const keyHash = await hashAdminApiKey(rawKey);
    const keyPrefix = getAdminApiKeyPrefix(rawKey);
    const keySuffix = getAdminApiKeySuffix(rawKey);
    const now = new Date();

    await tx.adminApiKeys.create({
      id: keyId,
      workspaceId: req.workspaceId,
      name: req.name,
      description: req.description,
      keyHash,
      keyPrefix,
      keySuffix,
      createdByEmail: currentUserEmail,
      createdAt: now,
      expiresAt: req.expiresAt,
      scopes: req.scopes,
      projectIds: req.projectIds,
    });

    await tx.auditLogs.create({
      id: createAuditLogId(),
      createdAt: now,
      userId: user.id,
      projectId: null,
      configId: null,
      payload: {
        type: 'admin_api_key_created',
        adminApiKey: {
          id: keyId,
          name: req.name,
          workspaceId: req.workspaceId,
          scopes: req.scopes,
          projectIds: req.projectIds,
        },
      },
    });

    return {
      adminApiKey: {
        id: keyId,
        name: req.name,
        description: req.description,
        keyPrefix,
        createdAt: now,
        scopes: req.scopes,
        projectIds: req.projectIds,
        expiresAt: req.expiresAt,
        token: rawKey,
      },
    };
  };
}

