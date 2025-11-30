import {buildRawApiToken} from '../api-token-utils';
import {createAuditLogId} from '../audit-log-store';
import {BadRequestError} from '../errors';
import type {TokenHashingService} from '../token-hashing-service';
import type {TransactionalUseCase} from '../use-case';
import {createUuidV7} from '../uuid';
import type {NormalizedEmail} from '../zod';

export interface CreateApiKeyRequest {
  currentUserEmail: NormalizedEmail;
  name: string;
  description: string;
  projectId: string;
  environmentId: string;
}

export interface CreateApiKeyResponse {
  apiKey: {
    id: string;
    name: string;
    description: string;
    createdAt: Date;
    token: string; // full token shown once
  };
}

export function createCreateApiKeyUseCase(deps: {
  tokenHasher: TokenHashingService;
}): TransactionalUseCase<CreateApiKeyRequest, CreateApiKeyResponse> {
  return async (ctx, tx, req) => {
    await tx.permissionService.ensureCanManageApiKeys(ctx, {
      projectId: req.projectId,
      currentUserEmail: req.currentUserEmail,
    });
    const user = await tx.users.getByEmail(req.currentUserEmail);
    if (!user) {
      throw new Error('User not found');
    }

    const env = await tx.projectEnvironments.getById({
      environmentId: req.environmentId,
      projectId: req.projectId,
    });
    if (!env) {
      throw new BadRequestError('Environment not found');
    }

    const sdkKeyId = createUuidV7();
    // Embed apiTokenId into token for future extraction
    const rawToken = buildRawApiToken(sdkKeyId);
    const tokenHash = await deps.tokenHasher.hash(rawToken);
    const now = new Date();

    await tx.sdkKeys.create({
      id: sdkKeyId,
      creatorId: user.id,
      createdAt: now,
      tokenHash,
      projectId: req.projectId,
      environmentId: req.environmentId,
      name: req.name,
      description: req.description,
    });

    await tx.auditLogs.create({
      id: createAuditLogId(),
      createdAt: now,
      userId: user.id,
      projectId: req.projectId,
      configId: null,
      payload: {
        type: 'api_key_created',
        apiKey: {
          id: sdkKeyId,
          name: req.name,
          description: req.description,
          createdAt: now,
        },
      },
    });

    return {
      apiKey: {
        id: sdkKeyId,
        name: req.name,
        description: req.description,
        createdAt: now,
        token: rawToken,
      },
    };
  };
}
