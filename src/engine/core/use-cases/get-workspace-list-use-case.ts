import type {TransactionalUseCase} from '../use-case';
import type {WorkspaceListItem} from '../workspace-query-service';
import type {NormalizedEmail} from '../zod';
import {createWorkspace} from './create-workspace-use-case';

export type {WorkspaceListItem};

export interface GetWorkspaceListRequest {
  currentUserEmail: NormalizedEmail;
}

export type GetWorkspaceListResponse = WorkspaceListItem[];

export function createGetWorkspaceListUseCase(): TransactionalUseCase<
  GetWorkspaceListRequest,
  GetWorkspaceListResponse
> {
  return async (_ctx, tx, req) => {
    let workspaces = await tx.workspaceQueryService.getWorkspaceList({
      currentUserEmail: req.currentUserEmail,
    });

    // If user has no workspaces, create a default workspace for them
    if (workspaces.length === 0) {
      await createWorkspace({
        currentUserEmail: req.currentUserEmail,
        name: {type: 'personal'},
        workspaceStore: tx.workspaces,
        workspaceMemberStore: tx.workspaceMembers,
        projectStore: tx.projects,
        projectUserStore: tx.projectUsers,
        projectEnvironmentStore: tx.projectEnvironments,
        configs: tx.configs,
        configVariants: tx.configVariants,
        users: tx.users,
        auditLogs: tx.auditLogs,
        now: new Date(),
        exampleProject: true,
      });

      // Fetch workspaces again after creation
      workspaces = await tx.workspaceQueryService.getWorkspaceList({
        currentUserEmail: req.currentUserEmail,
      });
    }

    return workspaces;
  };
}
