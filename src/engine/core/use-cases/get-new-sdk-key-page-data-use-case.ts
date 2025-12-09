import type {ProjectEnvironment} from '../project-query-service';
import type {TransactionalUseCase} from '../use-case';
import type {NormalizedEmail} from '../zod';

export interface GetNewSdkKeyPageDataRequest {
  projectId: string;
  currentUserEmail: NormalizedEmail;
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
      currentUserEmail: req.currentUserEmail,
    });

    const environments = await tx.projectQueryService.getEnvironments({
      projectId: req.projectId,
    });

    return {environments};
  };
}
