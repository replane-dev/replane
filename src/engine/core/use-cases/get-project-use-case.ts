import type {ProjectDetails} from '../project-query-service';
import type {TransactionalUseCase} from '../use-case';
import type {NormalizedEmail} from '../zod';

export type {ProjectDetails};

export interface GetProjectRequest {
  id: string;
  currentUserEmail: NormalizedEmail;
}

export interface GetProjectResponse {
  project: ProjectDetails | null;
}

export function createGetProjectUseCase(): TransactionalUseCase<
  GetProjectRequest,
  GetProjectResponse
> {
  return async (ctx, tx, req) => {
    await tx.permissionService.ensureIsWorkspaceMember(ctx, {
      projectId: req.id,
      currentUserEmail: req.currentUserEmail,
    });

    const project = await tx.projectQueryService.getProject({
      id: req.id,
      currentUserEmail: req.currentUserEmail,
    });

    return {project};
  };
}
