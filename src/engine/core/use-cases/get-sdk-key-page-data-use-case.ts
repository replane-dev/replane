import type {ProjectEnvironment} from '../project-query-service';
import type {TransactionalUseCase} from '../use-case';
import type {NormalizedEmail} from '../zod';

export interface GetSdkKeyPageDataRequest {
  id: string;
  projectId: string;
  currentUserEmail: NormalizedEmail;
}

export interface GetSdkKeyPageDataResponse {
  apiKey: {
    id: string;
    createdAt: Date;
    name: string;
    description: string;
    creatorEmail: string | null;
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
      currentUserEmail: req.currentUserEmail,
    });

    const [token, environments] = await Promise.all([
      tx.sdkKeys.getById({apiKeyId: req.id, projectId: req.projectId}),
      tx.projectQueryService.getEnvironments({
        projectId: req.projectId,
      }),
    ]);

    if (!token) {
      return {apiKey: null, environments};
    }

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
      environments,
    };
  };
}
