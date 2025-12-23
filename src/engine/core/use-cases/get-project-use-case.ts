import type {Identity} from '../identity';
import {isUserIdentity} from '../identity';
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

    // For API keys, we don't have a user email to get myRole
    const currentUserEmail = isUserIdentity(req.identity) ? req.identity.email : undefined;

    const project = await tx.projectQueryService.getProject({
      id: req.id,
      currentUserEmail,
    });

    return {project};
  };
}
