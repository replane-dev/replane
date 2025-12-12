import type {ProjectUserStore} from './stores/project-user-store';
import type {WorkspaceMemberStore} from './stores/workspace-member-store';
import type {NormalizedEmail} from './zod';

export class WorkspaceMemberService {
  constructor(
    private readonly workspaceMembers: WorkspaceMemberStore,
    private readonly projectUsers: ProjectUserStore,
  ) {}

  /**
   * Removes a member from a workspace and all its projects
   */
  async removeMemberFromWorkspace(params: {
    workspaceId: string;
    memberEmail: NormalizedEmail;
  }): Promise<void> {
    const {workspaceId, memberEmail} = params;

    // Delete workspace membership
    await this.workspaceMembers.delete(workspaceId, memberEmail);

    // Delete user from all projects in this workspace
    await this.projectUsers.deleteUserFromWorkspaceProjects({
      workspaceId,
      userEmail: memberEmail,
    });
  }

  /**
   * Removes a user from all workspaces they're a member of
   */
  async removeUserFromAllWorkspaces(params: {userEmail: NormalizedEmail}): Promise<void> {
    const {userEmail} = params;

    // Get all workspace memberships for this user
    const memberships = await this.workspaceMembers.getByUserEmail(userEmail);

    // Remove from each workspace
    for (const membership of memberships) {
      await this.removeMemberFromWorkspace({
        workspaceId: membership.workspace_id,
        memberEmail: userEmail,
      });
    }
  }
}
