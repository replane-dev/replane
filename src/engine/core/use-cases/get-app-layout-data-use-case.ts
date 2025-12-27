import {isEmailServerConfigured} from '@/environment';
import {requireUserEmail, type Identity} from '../identity';
import type {ProjectListItem} from '../project-query-service';
import type {TransactionalUseCase} from '../use-case';
import type {WorkspaceListItem} from '../workspace-service';

export interface GetAppLayoutDataRequest {
  identity: Identity;
}

export interface GetAppLayoutDataResponse {
  projects: ProjectListItem[];
  workspaces: WorkspaceListItem[];
  isEmailServerConfigured: boolean;
  region: string;
  primaryRegion: string;
}

export function createGetAppLayoutDataUseCase(): TransactionalUseCase<
  GetAppLayoutDataRequest,
  GetAppLayoutDataResponse
> {
  return async (ctx, tx, req) => {
    // This operation requires a user identity
    const currentUserEmail = requireUserEmail(req.identity);

    // query first to ensure user has at least one workspace
    const workspaces = await tx.workspaceService.getOrCreateUserWorkspaces({
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
      region: process.env.FLY_REGION ?? '',
      primaryRegion: process.env.PRIMARY_REGION ?? '',
    };
  };
}
