import type {UseCase} from '../use-case';
import type {NormalizedEmail} from '../zod';

export interface GetApiKeyListRequest {
  currentUserEmail: NormalizedEmail;
  projectId: string;
}

export interface GetApiKeyListResponse {
  apiKeys: Array<{
    id: string;
    createdAt: Date;
    name: string;
    description: string;
    creatorEmail: string | null;
  }>;
}

export function createGetApiKeyListUseCase(): UseCase<GetApiKeyListRequest, GetApiKeyListResponse> {
  return async (_ctx, tx, _req) => {
    const tokens = await tx.apiTokens.list({projectId: _req.projectId});
    return {
      apiKeys: tokens.map(t => ({
        id: t.id,
        createdAt: t.createdAt,
        name: t.name,
        description: t.description,
        creatorEmail: t.creatorEmail,
      })),
    };
  };
}
