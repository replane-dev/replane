import type {UseCase} from '../use-case';
import type {NormalizedEmail} from '../zod';

export interface GetApiKeyRequest {
  id: string;
  currentUserEmail: NormalizedEmail;
}

export interface GetApiKeyResponse {
  apiKey: {
    id: string;
    createdAt: Date;
    name: string;
    description: string;
    creatorEmail: string | null;
  } | null;
}

export function createGetApiKeyUseCase(): UseCase<GetApiKeyRequest, GetApiKeyResponse> {
  return async (_ctx, tx, req) => {
    const token = await tx.apiTokens.getById(req.id);
    if (!token) return {apiKey: null};
    return {
      apiKey: {
        id: token.id,
        createdAt: token.createdAt,
        name: token.name,
        description: token.description,
        creatorEmail: token.creatorEmail ?? null,
      },
    };
  };
}
