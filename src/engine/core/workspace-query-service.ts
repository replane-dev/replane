import type {WorkspaceInfo, WorkspaceStore} from './stores/workspace-store';
import type {NormalizedEmail} from './zod';

export type WorkspaceListItem = WorkspaceInfo;

export class WorkspaceQueryService {
  constructor(private workspaces: WorkspaceStore) {}

  async getWorkspaceList(opts: {currentUserEmail: NormalizedEmail}): Promise<WorkspaceListItem[]> {
    const workspaces = await this.workspaces.getAllTheUserMemberOf({
      currentUserEmail: opts.currentUserEmail,
    });

    return workspaces;
  }
}
