import type {Identity} from '../identity';
import type {ProjectEnvironment} from '../project-query-service';
import type {TransactionalUseCase} from '../use-case';

export interface GetSdkKeyPageDataRequest {
  id: string;
  projectId: string;
  identity: Identity;
}

export interface GetSdkKeyPageDataResponse {
  sdkKey: {
    id: string;
    createdAt: Date;
    keyPrefix: string;
    keySuffix: string;
    name: string;
    description: string;
    environmentId: string;
    environmentName: string;
  } | null;
  environments: ProjectEnvironment[];
}

export function createGetSdkKeyPageDataUseCase(): TransactionalUseCase<
  GetSdkKeyPageDataRequest,
  GetSdkKeyPageDataResponse
> {
  return async (ctx, tx, req) => {
    await tx.permissionService.ensureIsWorkspaceMember(ctx, {
      projectId: req.projectId,
      identity: req.identity,
    });

    const [token, environments] = await Promise.all([
      tx.sdkKeys.getById({sdkKeyId: req.id, projectId: req.projectId}),
      tx.projectQueryService.getEnvironments({
        projectId: req.projectId,
      }),
    ]);

    if (!token) {
      return {sdkKey: null, environments};
    }

    return {
      sdkKey: {
        id: token.id,
        createdAt: token.createdAt,
        keyPrefix: token.keyPrefix,
        keySuffix: token.keySuffix,
        name: token.name,
        description: token.description,
        environmentId: token.environmentId,
        environmentName: token.environmentName,
      },
      environments,
    };
  };
}
