import type {TransactionalUseCase} from '../use-case';
import type {NormalizedEmail} from '../zod';

export interface GetSdkKeyRequest {
  id: string;
  currentUserEmail: NormalizedEmail;
  projectId: string;
}

export interface GetSdkKeyResponse {
  sdkKey: {
    id: string;
    createdAt: Date;
    name: string;
    description: string;
    creatorEmail: string | null;
    environmentId: string;
    environmentName: string;
  } | null;
}

export function createGetSdkKeyUseCase(): TransactionalUseCase<
  GetSdkKeyRequest,
  GetSdkKeyResponse
> {
  return async (ctx, tx, req) => {
    await tx.permissionService.ensureIsWorkspaceMember(ctx, {
      projectId: req.projectId,
      currentUserEmail: req.currentUserEmail,
    });

    const sdkKey = await tx.sdkKeys.getById({sdkKeyId: req.id, projectId: req.projectId});
    if (!sdkKey) return {sdkKey: null};
    return {
      sdkKey: {
        id: sdkKey.id,
        createdAt: sdkKey.createdAt,
        name: sdkKey.name,
        description: sdkKey.description,
        creatorEmail: sdkKey.creatorEmail ?? null,
        environmentId: sdkKey.environmentId,
        environmentName: sdkKey.environmentName,
      },
    };
  };
}
