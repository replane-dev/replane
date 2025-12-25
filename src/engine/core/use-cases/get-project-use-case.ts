import type {Identity} from '../identity';
import type {ProjectDetails} from '../project-query-service';
import type {TransactionalUseCase} from '../use-case';

export type {ProjectDetails};

export interface GetProjectRequest {
  id: string;
  identity: Identity;
}

export interface GetProjectResponse {
  project: ProjectDetails | null;
}

export function createGetProjectUseCase(): TransactionalUseCase<
  GetProjectRequest,
  GetProjectResponse
> {
  return async (ctx, tx, req) => {
    await tx.permissionService.ensureCanReadProject(ctx, {
      projectId: req.id,
      identity: req.identity,
    });

    const project = await tx.projectQueryService.getProject(ctx, {
      id: req.id,
      identity: req.identity,
    });

    return {project};
  };
}
