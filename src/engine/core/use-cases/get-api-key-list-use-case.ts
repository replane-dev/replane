import type {TransactionalUseCase} from '../use-case';
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
    environmentId: string;
    environmentName: string;
  }>;
}

export function createGetApiKeyListUseCase(): TransactionalUseCase<
  GetApiKeyListRequest,
  GetApiKeyListResponse
> {
  return async (ctx, tx, req) => {
    await tx.permissionService.ensureIsOrganizationMember(ctx, {
      projectId: req.projectId,
      currentUserEmail: req.currentUserEmail,
    });

    const tokens = await tx.sdkKeys.list({projectId: req.projectId});
    return {
      apiKeys: tokens.map(t => ({
        id: t.id,
        createdAt: t.createdAt,
        name: t.name,
        description: t.description,
        creatorEmail: t.creatorEmail,
        environmentId: t.environmentId,
        environmentName: t.environmentName,
      })),
    };
  };
}
