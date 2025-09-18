import {createAuditMessageId} from '../audit-message-store';
import {BadRequestError} from '../errors';
import type {UseCase} from '../use-case';
import type {NormalizedEmail} from '../zod';

export interface DeleteApiKeyRequest {
  id: string;
  currentUserEmail: NormalizedEmail;
}

export interface DeleteApiKeyResponse {}

export function createDeleteApiKeyUseCase(): UseCase<DeleteApiKeyRequest, DeleteApiKeyResponse> {
  return async (_ctx, tx, req) => {
    const token = await tx.apiTokens.getById(req.id);
    if (!token) {
      throw new BadRequestError('API key not found');
    }

    await tx.permissionService.ensureCanManageApiKeys(token.projectId, req.currentUserEmail);

    // Only allow creator to delete for now
    const user = await tx.users.getByEmail(req.currentUserEmail);
    if (!user || user.id !== token.creatorId) {
      throw new Error('Not allowed to delete this API key');
    }
    await tx.apiTokens.deleteById(token.id);
    await tx.auditMessages.create({
      id: createAuditMessageId(),
      createdAt: new Date(),
      projectId: token.projectId,
      userId: user.id,
      configId: null,
      payload: {
        type: 'api_key_deleted',
        apiKey: {
          id: token.id,
          name: token.name,
          description: token.description,
          createdAt: token.createdAt,
        },
      },
    });
    return {};
  };
}
