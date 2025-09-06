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
    if (!token) return {};
    // Only allow creator to delete for now
    const user = await tx.users.getByEmail(req.currentUserEmail);
    if (!user || user.id !== token.creatorId) {
      throw new Error('Not allowed to delete this API key');
    }
    await tx.apiTokens.deleteById(token.id);
    return {};
  };
}
