import type {Identity} from '../identity';
import type {TransactionalUseCase} from '../use-case';

export interface GetSdkKeyRequest {
  id: string;
  identity: Identity;
  projectId: string;
}

export interface GetSdkKeyResponse {
  sdkKey: {
    id: string;
    createdAt: Date;
    name: string;
    description: string;
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
      identity: req.identity,
    });

    const sdkKey = await tx.sdkKeys.getById({sdkKeyId: req.id, projectId: req.projectId});
    if (!sdkKey) return {sdkKey: null};
    return {
      sdkKey: {
        id: sdkKey.id,
        createdAt: sdkKey.createdAt,
        name: sdkKey.name,
        description: sdkKey.description,
        environmentId: sdkKey.environmentId,
        environmentName: sdkKey.environmentName,
      },
    };
  };
}
