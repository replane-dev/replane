import {buildRawApiToken} from '../api-token-utils';
import {createAuditMessageId} from '../audit-message-store';
import type {TokenHashingService} from '../token-hashing-service';
import type {UseCase} from '../use-case';
import {createUuidV7} from '../uuid';
import type {NormalizedEmail} from '../zod';

export interface CreateApiKeyRequest {
  currentUserEmail: NormalizedEmail;
  name: string;
  description: string;
  projectId: string;
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
}): UseCase<CreateApiKeyRequest, CreateApiKeyResponse> {
  return async (_ctx, tx, req) => {
    await tx.permissionService.ensureCanManageApiKeys(req.projectId, req.currentUserEmail);
    const user = await tx.users.getByEmail(req.currentUserEmail);
    if (!user) {
      throw new Error('User not found');
    }

    const apiTokenId = createUuidV7();
    // Embed apiTokenId into token for future extraction
    const rawToken = buildRawApiToken(apiTokenId);
    const tokenHash = await deps.tokenHasher.hash(rawToken);
    const now = new Date();

    await tx.apiTokens.create({
      id: apiTokenId,
      creatorId: user.id,
      createdAt: now,
      tokenHash,
      projectId: req.projectId,
      name: req.name,
      description: req.description,
    });

    await tx.auditMessages.create({
      id: createAuditMessageId(),
      createdAt: now,
      userId: user.id,
      projectId: req.projectId,
      configId: null,
      payload: {
        type: 'api_key_created',
        apiKey: {
          id: apiTokenId,
          name: req.name,
          description: req.description,
          createdAt: now,
        },
      },
    });

    return {
      apiKey: {
        id: apiTokenId,
        name: req.name,
        description: req.description,
        createdAt: now,
        token: rawToken,
      },
    };
  };
}
