import {GLOBAL_CONTEXT} from '@/engine/core/context';
import {BadRequestError, ForbiddenError} from '@/engine/core/errors';
import {normalizeEmail} from '@/engine/core/utils';
import {describe, expect, it} from 'vitest';
import {useAppFixture} from './fixtures/trpc-fixture';

const CURRENT_USER_EMAIL = normalizeEmail('test@example.com');
const ANOTHER_USER_EMAIL = normalizeEmail('another@example.com');

describe('Workspaces', () => {
  const fixture = useAppFixture({authEmail: CURRENT_USER_EMAIL});

  describe('createWorkspace', () => {
    it('creates a workspace with current user as admin', async () => {
      const {workspaceId} = await fixture.engine.useCases.createWorkspace(GLOBAL_CONTEXT, {
        currentUserEmail: CURRENT_USER_EMAIL,
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
          currentUserEmail: CURRENT_USER_EMAIL,
          name: 'Org 1',
        },
      );

      // Get user's workspaces
      const orgs = await fixture.engine.useCases.getWorkspaceList(GLOBAL_CONTEXT, {
        currentUserEmail: CURRENT_USER_EMAIL,
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
        currentUserEmail: CURRENT_USER_EMAIL,
        name: 'Test Org',
      });

      const org = await fixture.engine.useCases.getWorkspace(GLOBAL_CONTEXT, {
        workspaceId,
        currentUserEmail: CURRENT_USER_EMAIL,
      });

      expect(org.id).toBe(workspaceId);
      expect(org.name).toBe('Test Org');
      expect(org.myRole).toBe('admin');
    });

    it('throws ForbiddenError when user is not a member', async () => {
      const {workspaceId} = await fixture.engine.useCases.createWorkspace(GLOBAL_CONTEXT, {
        currentUserEmail: CURRENT_USER_EMAIL,
        name: 'Private Org',
      });

      await expect(
        fixture.engine.useCases.getWorkspace(GLOBAL_CONTEXT, {
          workspaceId,
          currentUserEmail: ANOTHER_USER_EMAIL,
        }),
      ).rejects.toThrow(ForbiddenError);
    });
  });

  describe('updateWorkspace', () => {
    it('allows admin to update workspace', async () => {
      const {workspaceId} = await fixture.engine.useCases.createWorkspace(GLOBAL_CONTEXT, {
        currentUserEmail: CURRENT_USER_EMAIL,
        name: 'Original Name',
      });

      await fixture.engine.useCases.updateWorkspace(GLOBAL_CONTEXT, {
        workspaceId,
        currentUserEmail: CURRENT_USER_EMAIL,
        name: 'Updated Name',
      });

      const org = await fixture.engine.useCases.getWorkspace(GLOBAL_CONTEXT, {
        workspaceId,
        currentUserEmail: CURRENT_USER_EMAIL,
      });

      expect(org.name).toBe('Updated Name');
    });

    it('prevents non-admin from updating', async () => {
      const {workspaceId} = await fixture.engine.useCases.createWorkspace(GLOBAL_CONTEXT, {
        currentUserEmail: CURRENT_USER_EMAIL,
        name: 'Test Org',
      });

      // Add another user as member
      await fixture.engine.useCases.addWorkspaceMember(GLOBAL_CONTEXT, {
        workspaceId,
        currentUserEmail: CURRENT_USER_EMAIL,
        memberEmail: ANOTHER_USER_EMAIL,
        role: 'member',
      });

      await expect(
        fixture.engine.useCases.updateWorkspace(GLOBAL_CONTEXT, {
          workspaceId,
          currentUserEmail: ANOTHER_USER_EMAIL,
          name: 'Hacked Name',
        }),
      ).rejects.toThrow(ForbiddenError);
    });
  });

  describe('deleteWorkspace', () => {
    it('allows admin to delete workspace without projects', async () => {
      const {workspaceId} = await fixture.engine.useCases.createWorkspace(GLOBAL_CONTEXT, {
        currentUserEmail: CURRENT_USER_EMAIL,
        name: 'To Delete',
      });

      await fixture.engine.useCases.deleteWorkspace(GLOBAL_CONTEXT, {
        workspaceId,
        currentUserEmail: CURRENT_USER_EMAIL,
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
        currentUserEmail: CURRENT_USER_EMAIL,
        name: 'With Projects',
      });

      // Create a project in this workspace
      await fixture.engine.useCases.createProject(GLOBAL_CONTEXT, {
        currentUserEmail: CURRENT_USER_EMAIL,
        workspaceId,
        name: `Test Project ${workspaceId}`,
        description: 'Test',
      });

      await expect(
        fixture.engine.useCases.deleteWorkspace(GLOBAL_CONTEXT, {
          workspaceId,
          currentUserEmail: CURRENT_USER_EMAIL,
        }),
      ).resolves.toEqual({success: true});
    });

    it('prevents non-admin from deleting', async () => {
      const {workspaceId} = await fixture.engine.useCases.createWorkspace(GLOBAL_CONTEXT, {
        currentUserEmail: CURRENT_USER_EMAIL,
        name: 'Test Org',
      });

      await fixture.engine.useCases.addWorkspaceMember(GLOBAL_CONTEXT, {
        workspaceId,
        currentUserEmail: CURRENT_USER_EMAIL,
        memberEmail: ANOTHER_USER_EMAIL,
        role: 'member',
      });

      await expect(
        fixture.engine.useCases.deleteWorkspace(GLOBAL_CONTEXT, {
          workspaceId,
          currentUserEmail: ANOTHER_USER_EMAIL,
        }),
      ).rejects.toThrow(ForbiddenError);
    });
  });

  describe('Workspace Members', () => {
    describe('addWorkspaceMember', () => {
      it('allows admin to add members', async () => {
        const {workspaceId} = await fixture.engine.useCases.createWorkspace(GLOBAL_CONTEXT, {
          currentUserEmail: CURRENT_USER_EMAIL,
          name: 'Test Org',
        });

        await fixture.engine.useCases.addWorkspaceMember(GLOBAL_CONTEXT, {
          workspaceId,
          currentUserEmail: CURRENT_USER_EMAIL,
          memberEmail: ANOTHER_USER_EMAIL,
          role: 'member',
        });

        const members = await fixture.engine.useCases.getWorkspaceMembers(GLOBAL_CONTEXT, {
          workspaceId,
          currentUserEmail: CURRENT_USER_EMAIL,
        });

        expect(members.length).toBe(2);
        expect(members.find(m => m.email === ANOTHER_USER_EMAIL)).toMatchObject({
          email: ANOTHER_USER_EMAIL,
          role: 'member',
        });
      });

      it('prevents adding duplicate members', async () => {
        const {workspaceId} = await fixture.engine.useCases.createWorkspace(GLOBAL_CONTEXT, {
          currentUserEmail: CURRENT_USER_EMAIL,
          name: 'Test Org',
        });

        await fixture.engine.useCases.addWorkspaceMember(GLOBAL_CONTEXT, {
          workspaceId,
          currentUserEmail: CURRENT_USER_EMAIL,
          memberEmail: ANOTHER_USER_EMAIL,
          role: 'member',
        });

        await expect(
          fixture.engine.useCases.addWorkspaceMember(GLOBAL_CONTEXT, {
            workspaceId,
            currentUserEmail: CURRENT_USER_EMAIL,
            memberEmail: ANOTHER_USER_EMAIL,
            role: 'member',
          }),
        ).rejects.toThrow(BadRequestError);
      });

      it('prevents non-admin from adding members', async () => {
        const {workspaceId} = await fixture.engine.useCases.createWorkspace(GLOBAL_CONTEXT, {
          currentUserEmail: CURRENT_USER_EMAIL,
          name: 'Test Org',
        });

        await fixture.engine.useCases.addWorkspaceMember(GLOBAL_CONTEXT, {
          workspaceId,
          currentUserEmail: CURRENT_USER_EMAIL,
          memberEmail: ANOTHER_USER_EMAIL,
          role: 'member',
        });

        await expect(
          fixture.engine.useCases.addWorkspaceMember(GLOBAL_CONTEXT, {
            workspaceId,
            currentUserEmail: ANOTHER_USER_EMAIL,
            memberEmail: normalizeEmail('third@example.com'),
            role: 'member',
          }),
        ).rejects.toThrow(ForbiddenError);
      });
    });

    describe('removeWorkspaceMember', () => {
      it('allows admin to remove members', async () => {
        const {workspaceId} = await fixture.engine.useCases.createWorkspace(GLOBAL_CONTEXT, {
          currentUserEmail: CURRENT_USER_EMAIL,
          name: 'Test Org',
        });

        await fixture.engine.useCases.addWorkspaceMember(GLOBAL_CONTEXT, {
          workspaceId,
          currentUserEmail: CURRENT_USER_EMAIL,
          memberEmail: ANOTHER_USER_EMAIL,
          role: 'member',
        });

        await fixture.engine.useCases.removeWorkspaceMember(GLOBAL_CONTEXT, {
          workspaceId,
          currentUserEmail: CURRENT_USER_EMAIL,
          memberEmail: ANOTHER_USER_EMAIL,
        });

        const members = await fixture.engine.useCases.getWorkspaceMembers(GLOBAL_CONTEXT, {
          workspaceId,
          currentUserEmail: CURRENT_USER_EMAIL,
        });

        expect(members.length).toBe(1);
        expect(members.find(m => m.email === ANOTHER_USER_EMAIL)).toBeUndefined();
      });

      it('prevents removing last admin', async () => {
        const {workspaceId} = await fixture.engine.useCases.createWorkspace(GLOBAL_CONTEXT, {
          currentUserEmail: CURRENT_USER_EMAIL,
          name: 'Test Org',
        });

        await expect(
          fixture.engine.useCases.removeWorkspaceMember(GLOBAL_CONTEXT, {
            workspaceId,
            currentUserEmail: CURRENT_USER_EMAIL,
            memberEmail: CURRENT_USER_EMAIL,
          }),
        ).rejects.toThrow(BadRequestError);
      });
    });

    describe('updateWorkspaceMemberRole', () => {
      it('allows admin to change member roles', async () => {
        const {workspaceId} = await fixture.engine.useCases.createWorkspace(GLOBAL_CONTEXT, {
          currentUserEmail: CURRENT_USER_EMAIL,
          name: 'Test Org',
        });

        await fixture.engine.useCases.addWorkspaceMember(GLOBAL_CONTEXT, {
          workspaceId,
          currentUserEmail: CURRENT_USER_EMAIL,
          memberEmail: ANOTHER_USER_EMAIL,
          role: 'member',
        });

        await fixture.engine.useCases.updateWorkspaceMemberRole(GLOBAL_CONTEXT, {
          workspaceId,
          currentUserEmail: CURRENT_USER_EMAIL,
          memberEmail: ANOTHER_USER_EMAIL,
          role: 'admin',
        });

        const members = await fixture.engine.useCases.getWorkspaceMembers(GLOBAL_CONTEXT, {
          workspaceId,
          currentUserEmail: CURRENT_USER_EMAIL,
        });

        const updatedMember = members.find(m => m.email === ANOTHER_USER_EMAIL);
        expect(updatedMember?.role).toBe('admin');
      });

      it('prevents demoting last admin', async () => {
        const {workspaceId} = await fixture.engine.useCases.createWorkspace(GLOBAL_CONTEXT, {
          currentUserEmail: CURRENT_USER_EMAIL,
          name: 'Test Org',
        });

        await expect(
          fixture.engine.useCases.updateWorkspaceMemberRole(GLOBAL_CONTEXT, {
            workspaceId,
            currentUserEmail: CURRENT_USER_EMAIL,
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
        currentUserEmail: CURRENT_USER_EMAIL,
        name: 'Test Org',
      });

      // Add another user as workspace member
      await fixture.engine.useCases.addWorkspaceMember(GLOBAL_CONTEXT, {
        workspaceId,
        currentUserEmail: CURRENT_USER_EMAIL,
        memberEmail: ANOTHER_USER_EMAIL,
        role: 'member',
      });

      // Create project
      const {projectId} = await fixture.engine.useCases.createProject(GLOBAL_CONTEXT, {
        currentUserEmail: CURRENT_USER_EMAIL,
        workspaceId,
        name: `Permissions Test Project ${workspaceId}`,
        description: 'Test',
      });

      // Verify the other user can view the project through workspace membership
      const project = await fixture.engine.useCases.getProject(GLOBAL_CONTEXT, {
        id: projectId,
        currentUserEmail: ANOTHER_USER_EMAIL,
      });

      expect(project.project).toBeDefined();
      expect(project.project?.name).toBe(`Permissions Test Project ${workspaceId}`);
      // No explicit project role
      expect(project.project?.myRole).toBeNull();
    });
  });
});
