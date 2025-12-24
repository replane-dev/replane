import type {Identity} from '../identity';
import type {TransactionalUseCase} from '../use-case';

export interface GetSdkKeyListRequest {
  identity: Identity;
  projectId: string;
}

export interface GetSdkKeyListResponse {
  sdkKeys: Array<{
    id: string;
    createdAt: Date;
    keyPrefix: string;
    keySuffix: string;
    name: string;
    description: string;
    environmentId: string;
    environmentName: string;
  }>;
}

export function createGetSdkKeyListUseCase(): TransactionalUseCase<
  GetSdkKeyListRequest,
  GetSdkKeyListResponse
> {
  return async (ctx, tx, req) => {
    await tx.permissionService.ensureCanReadSdkKeys(ctx, {
      projectId: req.projectId,
      identity: req.identity,
    });

    const tokens = await tx.sdkKeys.list({projectId: req.projectId});
    return {
      sdkKeys: tokens.map(t => ({
        id: t.id,
        createdAt: t.createdAt,
        keyPrefix: t.keyPrefix,
        keySuffix: t.keySuffix,
        name: t.name,
        description: t.description,
        environmentId: t.environmentId,
        environmentName: t.environmentName,
      })),
    };
  };
}
