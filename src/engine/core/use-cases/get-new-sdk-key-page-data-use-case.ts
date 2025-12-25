import type {Identity} from '../identity';
import type {ProjectEnvironment} from '../project-query-service';
import type {TransactionalUseCase} from '../use-case';

export interface GetNewSdkKeyPageDataRequest {
  projectId: string;
  identity: Identity;
}

export interface GetNewSdkKeyPageDataResponse {
  environments: ProjectEnvironment[];
}

export function createGetNewSdkKeyPageDataUseCase(): TransactionalUseCase<
  GetNewSdkKeyPageDataRequest,
  GetNewSdkKeyPageDataResponse
> {
  return async (ctx, tx, req) => {
    await tx.permissionService.ensureIsWorkspaceMember(ctx, {
      projectId: req.projectId,
      identity: req.identity,
    });

    const environments = await tx.projectQueryService.getEnvironments({
      projectId: req.projectId,
    });

    return {environments};
  };
}
