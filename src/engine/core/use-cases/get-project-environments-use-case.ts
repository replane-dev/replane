import type {ProjectEnvironment} from '../project-query-service';
import type {TransactionalUseCase} from '../use-case';
import type {NormalizedEmail} from '../zod';

export type {ProjectEnvironment};

export interface GetProjectEnvironmentsRequest {
  projectId: string;
  currentUserEmail: NormalizedEmail;
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
      currentUserEmail: req.currentUserEmail,
    });

    const environments = await tx.projectQueryService.getEnvironments({
      projectId: req.projectId,
    });

    return {environments};
  };
}
