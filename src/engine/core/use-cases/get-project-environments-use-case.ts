import type {Identity} from '../identity';
import type {ProjectEnvironment} from '../project-query-service';
import type {TransactionalUseCase} from '../use-case';

export type {ProjectEnvironment};

export interface GetProjectEnvironmentsRequest {
  projectId: string;
  identity: Identity;
}

export interface GetProjectEnvironmentsResponse {
  environments: ProjectEnvironment[];
}

export function createGetProjectEnvironmentsUseCase(): TransactionalUseCase<
  GetProjectEnvironmentsRequest,
  GetProjectEnvironmentsResponse
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
