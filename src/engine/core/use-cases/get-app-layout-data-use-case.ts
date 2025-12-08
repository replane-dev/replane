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
  return async (_ctx, tx, req) => {
    const [projects, workspaces] = await Promise.all([
      tx.projectQueryService.getProjectList({
        currentUserEmail: req.currentUserEmail,
      }),
      tx.workspaceQueryService.getWorkspaceList({
        currentUserEmail: req.currentUserEmail,
      }),
    ]);

    return {projects, workspaces};
  };
}
