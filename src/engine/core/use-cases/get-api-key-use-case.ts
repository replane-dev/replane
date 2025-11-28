import type {TransactionalUseCase} from '../use-case';
import type {NormalizedEmail} from '../zod';

export interface GetApiKeyRequest {
  id: string;
  currentUserEmail: NormalizedEmail;
  projectId: string;
}

export interface GetApiKeyResponse {
  apiKey: {
    id: string;
    createdAt: Date;
    name: string;
    description: string;
    creatorEmail: string | null;
    environmentId: string;
    environmentName: string;
  } | null;
}

export function createGetApiKeyUseCase(): TransactionalUseCase<
  GetApiKeyRequest,
  GetApiKeyResponse
> {
  return async (_ctx, tx, req) => {
    const token = await tx.sdkKeys.getById({apiKeyId: req.id, projectId: req.projectId});
    if (!token) return {apiKey: null};
    return {
      apiKey: {
        id: token.id,
        createdAt: token.createdAt,
        name: token.name,
        description: token.description,
        creatorEmail: token.creatorEmail ?? null,
        environmentId: token.environmentId,
        environmentName: token.environmentName,
      },
    };
  };
}
