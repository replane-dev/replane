import {GLOBAL_CONTEXT} from '@/engine/core/context';
import {BadRequestError, ForbiddenError} from '@/engine/core/errors';
import {normalizeEmail} from '@/engine/core/utils';
import {describe, expect, it} from 'vitest';
import {emailToIdentity, useAppFixture} from './fixtures/trpc-fixture';

const CURRENT_USER_EMAIL = normalizeEmail('test@example.com');
const ANOTHER_USER_EMAIL = normalizeEmail('another@example.com');

describe('Workspaces', () => {
  const fixture = useAppFixture({authEmail: CURRENT_USER_EMAIL});

  describe('createWorkspace', () => {
    it('creates a workspace with current user as admin', async () => {
      const {workspaceId} = await fixture.engine.useCases.createWorkspace(GLOBAL_CONTEXT, {
        identity: emailToIdentity(CURRENT_USER_EMAIL),
        name: 'New Workspace',
      });

      // Verify workspace exists
      const orgs = await fixture.engine.testing.pool.query(
        `SELECT * FROM workspaces WHERE id = $1`,
        [workspaceId],
      );
      expect(orgs.rows.length).toBe(1);
      expect(orgs.rows[0].name).toBe('New Workspace');

      // Verify creator is admin
      const members = await fixture.engine.testing.pool.query(
        `SELECT * FROM workspace_members WHERE workspace_id = $1`,
        [workspaceId],
      );
      expect(members.rows.length).toBe(1);
      expect(members.rows[0].user_email_normalized).toBe(CURRENT_USER_EMAIL);
      expect(members.rows[0].role).toBe('admin');

      // Verify audit log
      const messages = await fixture.engine.testing.auditLogs.list({
        lte: new Date('2100-01-01T00:00:00Z'),
        limit: 20,
        orderBy: 'created_at desc, id desc',
      });
      const orgCreatedEvent = messages.find(
        m =>
          m.payload.type === 'workspace_created' && m.payload.workspace.id === workspaceId,
      );
      expect(orgCreatedEvent).toBeDefined();
      expect(orgCreatedEvent?.payload).toMatchObject({
        type: 'workspace_created',
        workspace: {
          id: workspaceId,
          name: 'New Workspace',
        },
      });
    });
  });

  describe('getWorkspaceList', () => {
    it('returns only workspaces where user is a member', async () => {
      // Create org1 with current user
      const {workspaceId: org1Id} = await fixture.engine.useCases.createWorkspace(
        GLOBAL_CONTEXT,
        {
          identity: emailToIdentity(CURRENT_USER_EMAIL),
          name: 'Org 1',
        },
      );

      // Get user's workspaces
      const orgs = await fixture.engine.useCases.getWorkspaceList(GLOBAL_CONTEXT, {
        identity: emailToIdentity(CURRENT_USER_EMAIL),
      });

      // Should include the test workspace created in fixture and org1
      expect(orgs.length).toBeGreaterThanOrEqual(2);
      expect(orgs.find(o => o.id === org1Id)).toBeDefined();
      expect(orgs.find(o => o.name === 'Test Workspace')).toBeDefined();
    });
  });

  describe('getWorkspace', () => {
    it('returns workspace details when user is a member', async () => {
      const {workspaceId} = await fixture.engine.useCases.createWorkspace(GLOBAL_CONTEXT, {
        identity: emailToIdentity(CURRENT_USER_EMAIL),
        name: 'Test Org',
      });

      const org = await fixture.engine.useCases.getWorkspace(GLOBAL_CONTEXT, {
        workspaceId,
        identity: emailToIdentity(CURRENT_USER_EMAIL),
      });

      expect(org.id).toBe(workspaceId);
      expect(org.name).toBe('Test Org');
      expect(org.myRole).toBe('admin');
    });

    it('throws ForbiddenError when user is not a member', async () => {
      const {workspaceId} = await fixture.engine.useCases.createWorkspace(GLOBAL_CONTEXT, {
        identity: emailToIdentity(CURRENT_USER_EMAIL),
        name: 'Private Org',
      });

      await expect(
        fixture.engine.useCases.getWorkspace(GLOBAL_CONTEXT, {
          workspaceId,
          identity: emailToIdentity(ANOTHER_USER_EMAIL),
        }),
      ).rejects.toThrow(ForbiddenError);
    });
  });

  describe('updateWorkspace', () => {
    it('allows admin to update workspace', async () => {
      const {workspaceId} = await fixture.engine.useCases.createWorkspace(GLOBAL_CONTEXT, {
        identity: emailToIdentity(CURRENT_USER_EMAIL),
        name: 'Original Name',
      });

      await fixture.engine.useCases.updateWorkspace(GLOBAL_CONTEXT, {
        workspaceId,
        identity: emailToIdentity(CURRENT_USER_EMAIL),
        name: 'Updated Name',
      });

      const org = await fixture.engine.useCases.getWorkspace(GLOBAL_CONTEXT, {
        workspaceId,
        identity: emailToIdentity(CURRENT_USER_EMAIL),
      });

      expect(org.name).toBe('Updated Name');
    });

    it('prevents non-admin from updating', async () => {
      const {workspaceId} = await fixture.engine.useCases.createWorkspace(GLOBAL_CONTEXT, {
        identity: emailToIdentity(CURRENT_USER_EMAIL),
        name: 'Test Org',
      });

      // Add another user as member
      await fixture.engine.useCases.addWorkspaceMember(GLOBAL_CONTEXT, {
        workspaceId,
        identity: emailToIdentity(CURRENT_USER_EMAIL),
        memberEmail: ANOTHER_USER_EMAIL,
        role: 'member',
      });

      await expect(
        fixture.engine.useCases.updateWorkspace(GLOBAL_CONTEXT, {
          workspaceId,
          identity: emailToIdentity(ANOTHER_USER_EMAIL),
          name: 'Hacked Name',
        }),
      ).rejects.toThrow(ForbiddenError);
    });
  });

  describe('deleteWorkspace', () => {
    it('allows admin to delete workspace without projects', async () => {
      const {workspaceId} = await fixture.engine.useCases.createWorkspace(GLOBAL_CONTEXT, {
        identity: emailToIdentity(CURRENT_USER_EMAIL),
        name: 'To Delete',
      });

      await fixture.engine.useCases.deleteWorkspace(GLOBAL_CONTEXT, {
        workspaceId,
        identity: emailToIdentity(CURRENT_USER_EMAIL),
      });

      // Verify workspace is deleted
      const orgs = await fixture.engine.testing.pool.query(
        `SELECT * FROM workspaces WHERE id = $1`,
        [workspaceId],
      );
      expect(orgs.rows.length).toBe(0);
    });

    it('allows prevents deletion when workspace has projects', async () => {
      const {workspaceId} = await fixture.engine.useCases.createWorkspace(GLOBAL_CONTEXT, {
        identity: emailToIdentity(CURRENT_USER_EMAIL),
        name: 'With Projects',
      });

      // Create a project in this workspace
      await fixture.engine.useCases.createProject(GLOBAL_CONTEXT, {
        identity: emailToIdentity(CURRENT_USER_EMAIL),
        workspaceId,
        name: `Test Project ${workspaceId}`,
        description: 'Test',
      });

      await expect(
        fixture.engine.useCases.deleteWorkspace(GLOBAL_CONTEXT, {
          workspaceId,
          identity: emailToIdentity(CURRENT_USER_EMAIL),
        }),
      ).resolves.toEqual({success: true});
    });

    it('prevents non-admin from deleting', async () => {
      const {workspaceId} = await fixture.engine.useCases.createWorkspace(GLOBAL_CONTEXT, {
        identity: emailToIdentity(CURRENT_USER_EMAIL),
        name: 'Test Org',
      });

      await fixture.engine.useCases.addWorkspaceMember(GLOBAL_CONTEXT, {
        workspaceId,
        identity: emailToIdentity(CURRENT_USER_EMAIL),
        memberEmail: ANOTHER_USER_EMAIL,
        role: 'member',
      });

      await expect(
        fixture.engine.useCases.deleteWorkspace(GLOBAL_CONTEXT, {
          workspaceId,
          identity: emailToIdentity(ANOTHER_USER_EMAIL),
        }),
      ).rejects.toThrow(ForbiddenError);
    });
  });

  describe('Workspace Members', () => {
    describe('addWorkspaceMember', () => {
      it('allows admin to add members', async () => {
        const {workspaceId} = await fixture.engine.useCases.createWorkspace(GLOBAL_CONTEXT, {
          identity: emailToIdentity(CURRENT_USER_EMAIL),
          name: 'Test Org',
        });

        await fixture.engine.useCases.addWorkspaceMember(GLOBAL_CONTEXT, {
          workspaceId,
          identity: emailToIdentity(CURRENT_USER_EMAIL),
          memberEmail: ANOTHER_USER_EMAIL,
          role: 'member',
        });

        const members = await fixture.engine.useCases.getWorkspaceMembers(GLOBAL_CONTEXT, {
          workspaceId,
          identity: emailToIdentity(CURRENT_USER_EMAIL),
        });

        expect(members.length).toBe(2);
        expect(members.find(m => m.email === ANOTHER_USER_EMAIL)).toMatchObject({
          email: ANOTHER_USER_EMAIL,
          role: 'member',
        });
      });

      it('prevents adding duplicate members', async () => {
        const {workspaceId} = await fixture.engine.useCases.createWorkspace(GLOBAL_CONTEXT, {
          identity: emailToIdentity(CURRENT_USER_EMAIL),
          name: 'Test Org',
        });

        await fixture.engine.useCases.addWorkspaceMember(GLOBAL_CONTEXT, {
          workspaceId,
          identity: emailToIdentity(CURRENT_USER_EMAIL),
          memberEmail: ANOTHER_USER_EMAIL,
          role: 'member',
        });

        await expect(
          fixture.engine.useCases.addWorkspaceMember(GLOBAL_CONTEXT, {
            workspaceId,
            identity: emailToIdentity(CURRENT_USER_EMAIL),
            memberEmail: ANOTHER_USER_EMAIL,
            role: 'member',
          }),
        ).rejects.toThrow(BadRequestError);
      });

      it('prevents non-admin from adding members', async () => {
        const {workspaceId} = await fixture.engine.useCases.createWorkspace(GLOBAL_CONTEXT, {
          identity: emailToIdentity(CURRENT_USER_EMAIL),
          name: 'Test Org',
        });

        await fixture.engine.useCases.addWorkspaceMember(GLOBAL_CONTEXT, {
          workspaceId,
          identity: emailToIdentity(CURRENT_USER_EMAIL),
          memberEmail: ANOTHER_USER_EMAIL,
          role: 'member',
        });

        await expect(
          fixture.engine.useCases.addWorkspaceMember(GLOBAL_CONTEXT, {
            workspaceId,
            identity: emailToIdentity(ANOTHER_USER_EMAIL),
            memberEmail: normalizeEmail('third@example.com'),
            role: 'member',
          }),
        ).rejects.toThrow(ForbiddenError);
      });
    });

    describe('removeWorkspaceMember', () => {
      it('allows admin to remove members', async () => {
        const {workspaceId} = await fixture.engine.useCases.createWorkspace(GLOBAL_CONTEXT, {
          identity: emailToIdentity(CURRENT_USER_EMAIL),
          name: 'Test Org',
        });

        await fixture.engine.useCases.addWorkspaceMember(GLOBAL_CONTEXT, {
          workspaceId,
          identity: emailToIdentity(CURRENT_USER_EMAIL),
          memberEmail: ANOTHER_USER_EMAIL,
          role: 'member',
        });

        await fixture.engine.useCases.removeWorkspaceMember(GLOBAL_CONTEXT, {
          workspaceId,
          identity: emailToIdentity(CURRENT_USER_EMAIL),
          memberEmail: ANOTHER_USER_EMAIL,
        });

        const members = await fixture.engine.useCases.getWorkspaceMembers(GLOBAL_CONTEXT, {
          workspaceId,
          identity: emailToIdentity(CURRENT_USER_EMAIL),
        });

        expect(members.length).toBe(1);
        expect(members.find(m => m.email === ANOTHER_USER_EMAIL)).toBeUndefined();
      });

      it('prevents removing last admin', async () => {
        const {workspaceId} = await fixture.engine.useCases.createWorkspace(GLOBAL_CONTEXT, {
          identity: emailToIdentity(CURRENT_USER_EMAIL),
          name: 'Test Org',
        });

        await expect(
          fixture.engine.useCases.removeWorkspaceMember(GLOBAL_CONTEXT, {
            workspaceId,
            identity: emailToIdentity(CURRENT_USER_EMAIL),
            memberEmail: CURRENT_USER_EMAIL,
          }),
        ).rejects.toThrow(BadRequestError);
      });

      it('removes user from all projects within the workspace', async () => {
        // Create a workspace
        const {workspaceId} = await fixture.engine.useCases.createWorkspace(GLOBAL_CONTEXT, {
          identity: emailToIdentity(CURRENT_USER_EMAIL),
          name: 'Test Org With Projects',
        });

        // Add another user as workspace member
        await fixture.engine.useCases.addWorkspaceMember(GLOBAL_CONTEXT, {
          workspaceId,
          identity: emailToIdentity(CURRENT_USER_EMAIL),
          memberEmail: ANOTHER_USER_EMAIL,
          role: 'member',
        });

        // Create a project and add the member to it
        const {projectId: projectId1} = await fixture.engine.useCases.createProject(GLOBAL_CONTEXT, {
          identity: emailToIdentity(CURRENT_USER_EMAIL),
          workspaceId,
          name: `Project 1 ${workspaceId}`,
          description: 'Test project 1',
        });

        // Add the member as a project admin
        await fixture.engine.useCases.updateProjectUsers(GLOBAL_CONTEXT, {
          projectId: projectId1,
          identity: emailToIdentity(CURRENT_USER_EMAIL),
          users: [
            {email: CURRENT_USER_EMAIL, role: 'admin'},
            {email: ANOTHER_USER_EMAIL, role: 'maintainer'},
          ],
        });

        // Verify user is in the project
        const projectUsersBefore = await fixture.engine.testing.pool.query(
          `SELECT * FROM project_users WHERE project_id = $1 AND user_email_normalized = $2`,
          [projectId1, ANOTHER_USER_EMAIL],
        );
        expect(projectUsersBefore.rows.length).toBe(1);
        expect(projectUsersBefore.rows[0].role).toBe('maintainer');

        // Remove the member from the workspace
        await fixture.engine.useCases.removeWorkspaceMember(GLOBAL_CONTEXT, {
          workspaceId,
          identity: emailToIdentity(CURRENT_USER_EMAIL),
          memberEmail: ANOTHER_USER_EMAIL,
        });

        // Verify user is removed from the project
        const projectUsersAfter = await fixture.engine.testing.pool.query(
          `SELECT * FROM project_users WHERE project_id = $1 AND user_email_normalized = $2`,
          [projectId1, ANOTHER_USER_EMAIL],
        );
        expect(projectUsersAfter.rows.length).toBe(0);
      });

      it('removes user from multiple projects within the workspace', async () => {
        // Create a workspace
        const {workspaceId} = await fixture.engine.useCases.createWorkspace(GLOBAL_CONTEXT, {
          identity: emailToIdentity(CURRENT_USER_EMAIL),
          name: 'Test Org Multi Projects',
        });

        // Add another user as workspace member
        await fixture.engine.useCases.addWorkspaceMember(GLOBAL_CONTEXT, {
          workspaceId,
          identity: emailToIdentity(CURRENT_USER_EMAIL),
          memberEmail: ANOTHER_USER_EMAIL,
          role: 'member',
        });

        // Create multiple projects
        const {projectId: projectId1} = await fixture.engine.useCases.createProject(GLOBAL_CONTEXT, {
          identity: emailToIdentity(CURRENT_USER_EMAIL),
          workspaceId,
          name: `Multi Project 1 ${workspaceId}`,
          description: 'Test project 1',
        });

        const {projectId: projectId2} = await fixture.engine.useCases.createProject(GLOBAL_CONTEXT, {
          identity: emailToIdentity(CURRENT_USER_EMAIL),
          workspaceId,
          name: `Multi Project 2 ${workspaceId}`,
          description: 'Test project 2',
        });

        const {projectId: projectId3} = await fixture.engine.useCases.createProject(GLOBAL_CONTEXT, {
          identity: emailToIdentity(CURRENT_USER_EMAIL),
          workspaceId,
          name: `Multi Project 3 ${workspaceId}`,
          description: 'Test project 3',
        });

        // Add the member to all three projects with different roles
        await fixture.engine.useCases.updateProjectUsers(GLOBAL_CONTEXT, {
          projectId: projectId1,
          identity: emailToIdentity(CURRENT_USER_EMAIL),
          users: [
            {email: CURRENT_USER_EMAIL, role: 'admin'},
            {email: ANOTHER_USER_EMAIL, role: 'admin'},
          ],
        });

        await fixture.engine.useCases.updateProjectUsers(GLOBAL_CONTEXT, {
          projectId: projectId2,
          identity: emailToIdentity(CURRENT_USER_EMAIL),
          users: [
            {email: CURRENT_USER_EMAIL, role: 'admin'},
            {email: ANOTHER_USER_EMAIL, role: 'maintainer'},
          ],
        });

        await fixture.engine.useCases.updateProjectUsers(GLOBAL_CONTEXT, {
          projectId: projectId3,
          identity: emailToIdentity(CURRENT_USER_EMAIL),
          users: [
            {email: CURRENT_USER_EMAIL, role: 'admin'},
            {email: ANOTHER_USER_EMAIL, role: 'maintainer'},
          ],
        });

        // Verify user is in all projects
        const allProjectUsersBefore = await fixture.engine.testing.pool.query(
          `SELECT * FROM project_users WHERE user_email_normalized = $1 AND project_id IN ($2, $3, $4)`,
          [ANOTHER_USER_EMAIL, projectId1, projectId2, projectId3],
        );
        expect(allProjectUsersBefore.rows.length).toBe(3);

        // Remove the member from the workspace
        await fixture.engine.useCases.removeWorkspaceMember(GLOBAL_CONTEXT, {
          workspaceId,
          identity: emailToIdentity(CURRENT_USER_EMAIL),
          memberEmail: ANOTHER_USER_EMAIL,
        });

        // Verify user is removed from all projects
        const allProjectUsersAfter = await fixture.engine.testing.pool.query(
          `SELECT * FROM project_users WHERE user_email_normalized = $1 AND project_id IN ($2, $3, $4)`,
          [ANOTHER_USER_EMAIL, projectId1, projectId2, projectId3],
        );
        expect(allProjectUsersAfter.rows.length).toBe(0);

        // Verify workspace members list no longer includes the removed user
        const members = await fixture.engine.useCases.getWorkspaceMembers(GLOBAL_CONTEXT, {
          workspaceId,
          identity: emailToIdentity(CURRENT_USER_EMAIL),
        });
        expect(members.find(m => m.email === ANOTHER_USER_EMAIL)).toBeUndefined();
      });

      it('does not affect user projects in other workspaces', async () => {
        // Create two workspaces
        const {workspaceId: workspace1Id} = await fixture.engine.useCases.createWorkspace(
          GLOBAL_CONTEXT,
          {
            identity: emailToIdentity(CURRENT_USER_EMAIL),
            name: 'Workspace 1',
          },
        );

        const {workspaceId: workspace2Id} = await fixture.engine.useCases.createWorkspace(
          GLOBAL_CONTEXT,
          {
            identity: emailToIdentity(CURRENT_USER_EMAIL),
            name: 'Workspace 2',
          },
        );

        // Add another user as member to both workspaces
        await fixture.engine.useCases.addWorkspaceMember(GLOBAL_CONTEXT, {
          workspaceId: workspace1Id,
          identity: emailToIdentity(CURRENT_USER_EMAIL),
          memberEmail: ANOTHER_USER_EMAIL,
          role: 'member',
        });

        await fixture.engine.useCases.addWorkspaceMember(GLOBAL_CONTEXT, {
          workspaceId: workspace2Id,
          identity: emailToIdentity(CURRENT_USER_EMAIL),
          memberEmail: ANOTHER_USER_EMAIL,
          role: 'member',
        });

        // Create a project in each workspace
        const {projectId: project1Id} = await fixture.engine.useCases.createProject(GLOBAL_CONTEXT, {
          identity: emailToIdentity(CURRENT_USER_EMAIL),
          workspaceId: workspace1Id,
          name: `Ws1 Project ${workspace1Id}`,
          description: 'Project in workspace 1',
        });

        const {projectId: project2Id} = await fixture.engine.useCases.createProject(GLOBAL_CONTEXT, {
          identity: emailToIdentity(CURRENT_USER_EMAIL),
          workspaceId: workspace2Id,
          name: `Ws2 Project ${workspace2Id}`,
          description: 'Project in workspace 2',
        });

        // Add the member to both projects
        await fixture.engine.useCases.updateProjectUsers(GLOBAL_CONTEXT, {
          projectId: project1Id,
          identity: emailToIdentity(CURRENT_USER_EMAIL),
          users: [
            {email: CURRENT_USER_EMAIL, role: 'admin'},
            {email: ANOTHER_USER_EMAIL, role: 'maintainer'},
          ],
        });

        await fixture.engine.useCases.updateProjectUsers(GLOBAL_CONTEXT, {
          projectId: project2Id,
          identity: emailToIdentity(CURRENT_USER_EMAIL),
          users: [
            {email: CURRENT_USER_EMAIL, role: 'admin'},
            {email: ANOTHER_USER_EMAIL, role: 'maintainer'},
          ],
        });

        // Remove the member from workspace 1 only
        await fixture.engine.useCases.removeWorkspaceMember(GLOBAL_CONTEXT, {
          workspaceId: workspace1Id,
          identity: emailToIdentity(CURRENT_USER_EMAIL),
          memberEmail: ANOTHER_USER_EMAIL,
        });

        // Verify user is removed from project in workspace 1
        const project1UsersAfter = await fixture.engine.testing.pool.query(
          `SELECT * FROM project_users WHERE project_id = $1 AND user_email_normalized = $2`,
          [project1Id, ANOTHER_USER_EMAIL],
        );
        expect(project1UsersAfter.rows.length).toBe(0);

        // Verify user still exists in project in workspace 2
        const project2UsersAfter = await fixture.engine.testing.pool.query(
          `SELECT * FROM project_users WHERE project_id = $1 AND user_email_normalized = $2`,
          [project2Id, ANOTHER_USER_EMAIL],
        );
        expect(project2UsersAfter.rows.length).toBe(1);
        expect(project2UsersAfter.rows[0].role).toBe('maintainer');
      });
    });

    describe('updateWorkspaceMemberRole', () => {
      it('allows admin to change member roles', async () => {
        const {workspaceId} = await fixture.engine.useCases.createWorkspace(GLOBAL_CONTEXT, {
          identity: emailToIdentity(CURRENT_USER_EMAIL),
          name: 'Test Org',
        });

        await fixture.engine.useCases.addWorkspaceMember(GLOBAL_CONTEXT, {
          workspaceId,
          identity: emailToIdentity(CURRENT_USER_EMAIL),
          memberEmail: ANOTHER_USER_EMAIL,
          role: 'member',
        });

        await fixture.engine.useCases.updateWorkspaceMemberRole(GLOBAL_CONTEXT, {
          workspaceId,
          identity: emailToIdentity(CURRENT_USER_EMAIL),
          memberEmail: ANOTHER_USER_EMAIL,
          role: 'admin',
        });

        const members = await fixture.engine.useCases.getWorkspaceMembers(GLOBAL_CONTEXT, {
          workspaceId,
          identity: emailToIdentity(CURRENT_USER_EMAIL),
        });

        const updatedMember = members.find(m => m.email === ANOTHER_USER_EMAIL);
        expect(updatedMember?.role).toBe('admin');
      });

      it('prevents demoting last admin', async () => {
        const {workspaceId} = await fixture.engine.useCases.createWorkspace(GLOBAL_CONTEXT, {
          identity: emailToIdentity(CURRENT_USER_EMAIL),
          name: 'Test Org',
        });

        await expect(
          fixture.engine.useCases.updateWorkspaceMemberRole(GLOBAL_CONTEXT, {
            workspaceId,
            identity: emailToIdentity(CURRENT_USER_EMAIL),
            memberEmail: CURRENT_USER_EMAIL,
            role: 'member',
          }),
        ).rejects.toThrow(BadRequestError);
      });
    });
  });

  describe('Permissions', () => {
    it('workspace members can view projects without explicit project role', async () => {
      const {workspaceId} = await fixture.engine.useCases.createWorkspace(GLOBAL_CONTEXT, {
        identity: emailToIdentity(CURRENT_USER_EMAIL),
        name: 'Test Org',
      });

      // Add another user as workspace member
      await fixture.engine.useCases.addWorkspaceMember(GLOBAL_CONTEXT, {
        workspaceId,
        identity: emailToIdentity(CURRENT_USER_EMAIL),
        memberEmail: ANOTHER_USER_EMAIL,
        role: 'member',
      });

      // Create project
      const {projectId} = await fixture.engine.useCases.createProject(GLOBAL_CONTEXT, {
        identity: emailToIdentity(CURRENT_USER_EMAIL),
        workspaceId,
        name: `Permissions Test Project ${workspaceId}`,
        description: 'Test',
      });

      // Verify the other user can view the project through workspace membership
      const project = await fixture.engine.useCases.getProject(GLOBAL_CONTEXT, {
        id: projectId,
        identity: emailToIdentity(ANOTHER_USER_EMAIL),
      });

      expect(project.project).toBeDefined();
      expect(project.project?.name).toBe(`Permissions Test Project ${workspaceId}`);
      // No explicit project role
      expect(project.project?.myRole).toBeNull();
    });
  });
});
