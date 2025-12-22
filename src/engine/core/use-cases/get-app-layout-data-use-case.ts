import {isEmailServerConfigured} from '@/environment';
import {requireUserEmail, type Identity} from '../identity';
import type {ProjectListItem} from '../project-query-service';
import type {TransactionalUseCase} from '../use-case';
import type {WorkspaceListItem} from '../workspace-query-service';

export interface GetAppLayoutDataRequest {
  identity: Identity;
}

export interface GetAppLayoutDataResponse {
  projects: ProjectListItem[];
  workspaces: WorkspaceListItem[];
  isEmailServerConfigured: boolean;
}

export function createGetAppLayoutDataUseCase(): TransactionalUseCase<
  GetAppLayoutDataRequest,
  GetAppLayoutDataResponse
> {
  return async (ctx, tx, req) => {
    // This operation requires a user identity
    const currentUserEmail = requireUserEmail(req.identity);

    // query first to ensure user has at least one workspace
    const workspaces = await tx.workspaceQueryService.getOrCreateUserWorkspaces({
      ctx,
      identity: req.identity,
    });
    const projects = await tx.projectQueryService.getProjectList({
      currentUserEmail,
    });

    return {
      projects,
      workspaces,
      isEmailServerConfigured: isEmailServerConfigured(),
    };
  };
}
