import type {ProjectListItem} from '../project-query-service';
import type {TransactionalUseCase} from '../use-case';
import type {WorkspaceListItem} from '../workspace-query-service';
import type {NormalizedEmail} from '../zod';

export interface GetAppLayoutDataRequest {
  currentUserEmail: NormalizedEmail;
}

export interface GetAppLayoutDataResponse {
  projects: ProjectListItem[];
  workspaces: WorkspaceListItem[];
}

export function createGetAppLayoutDataUseCase(): TransactionalUseCase<
  GetAppLayoutDataRequest,
  GetAppLayoutDataResponse
> {
  return async (ctx, tx, req) => {
    // query first to ensure user has at least one workspace
    const workspaces = await tx.workspaceQueryService.getOrCreateUserWorkspaces({
      ctx,
      currentUserEmail: req.currentUserEmail,
    });
    const projects = await tx.projectQueryService.getProjectList({
      currentUserEmail: req.currentUserEmail,
    });

    return {projects, workspaces};
  };
}
