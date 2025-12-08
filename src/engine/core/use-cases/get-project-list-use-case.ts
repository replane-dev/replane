import type {ProjectListItem} from '../project-query-service';
import type {TransactionalUseCase} from '../use-case';
import type {NormalizedEmail} from '../zod';

export type {ProjectListItem};

export interface GetProjectListRequest {
  currentUserEmail: NormalizedEmail;
}

export interface GetProjectListResponse {
  projects: ProjectListItem[];
}

export function createGetProjectListUseCase(): TransactionalUseCase<
  GetProjectListRequest,
  GetProjectListResponse
> {
  return async (_ctx, tx, req) => {
    const projects = await tx.projectQueryService.getProjectList({
      currentUserEmail: req.currentUserEmail,
    });
    return {projects};
  };
}
