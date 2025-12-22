import {requireUserEmail, type Identity} from '../identity';
import type {ProjectListItem} from '../project-query-service';
import type {TransactionalUseCase} from '../use-case';

export type {ProjectListItem};

export interface GetProjectListRequest {
  identity: Identity;
}

export interface GetProjectListResponse {
  projects: ProjectListItem[];
}

export function createGetProjectListUseCase(): TransactionalUseCase<
  GetProjectListRequest,
  GetProjectListResponse
> {
  return async (_ctx, tx, req) => {
    // This operation requires a user identity since projects are user-specific
    const currentUserEmail = requireUserEmail(req.identity);

    const projects = await tx.projectQueryService.getProjectList({
      currentUserEmail,
    });
    return {projects};
  };
}
