import {ForbiddenError} from '../errors';
import {
  hasProjectAccess,
  hasScope,
  isApiKeyIdentity,
  isSuperuserIdentity,
  isUserIdentity,
  type Identity,
} from '../identity';
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
    if (isUserIdentity(req.identity)) {
      const projects = await tx.projectQueryService.getProjectList({
        currentUserEmail: req.identity.user.email,
      });
      return {projects};
    }

    if (isSuperuserIdentity(req.identity)) {
      // Superuser: return all projects in the instance
      const allProjects = await tx.projects.getAll();

      return {
        projects: allProjects.map(p => ({
          id: p.id,
          name: p.name,
          workspaceId: p.workspaceId,
          descriptionPreview: p.descriptionPreview,
          createdAt: p.createdAt,
          updatedAt: p.updatedAt,
          requireProposals: p.requireProposals,
          allowSelfApprovals: p.allowSelfApprovals,
        })),
      };
    }

    if (isApiKeyIdentity(req.identity)) {
      const apiKeyIdentity = req.identity;

      // API key identity: get projects the API key has access to
      if (!hasScope(apiKeyIdentity, 'project:read')) {
        throw new ForbiddenError('Missing required scope: project:read');
      }

      // Get all projects in the workspace
      const allProjects = await tx.projects.getByWorkspaceId(apiKeyIdentity.workspaceId);

      // Filter to only accessible projects based on API key's projectIds restriction
      const accessibleProjects = allProjects.filter(p =>
        hasProjectAccess({identity: apiKeyIdentity, project: p}),
      );

      return {
        projects: accessibleProjects.map(p => ({
          id: p.id,
          name: p.name,
          workspaceId: p.workspaceId,
          descriptionPreview: p.descriptionPreview,
          createdAt: p.createdAt,
          updatedAt: p.updatedAt,
          requireProposals: p.requireProposals,
          allowSelfApprovals: p.allowSelfApprovals,
        })),
      };
    }

    throw new ForbiddenError('Invalid identity type');
  };
}
