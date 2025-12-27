import {GLOBAL_CONTEXT} from '@/engine/core/context';
import {createUserIdentity} from '@/engine/core/identity';
import {normalizeEmail} from '@/engine/core/utils';
import {describe, expect, it} from 'vitest';
import {useAppFixture} from './fixtures/app-fixture';

const CURRENT_USER_EMAIL = normalizeEmail('test@example.com');
const NEW_USER_EMAIL = normalizeEmail('newuser@example.com');

describe('initUser', () => {
  const fixture = useAppFixture({authEmail: CURRENT_USER_EMAIL});

  describe('when user is not part of any workspace', () => {
    it('creates a personal workspace with example project', async () => {
      // Register a new user who is not part of any workspace
      const newUserIdentity = await fixture.registerUser(NEW_USER_EMAIL, 'New User');

      // Call initUser for the new user
      const result = await fixture.engine.useCases.initUser(GLOBAL_CONTEXT, {
        identity: newUserIdentity,
        exampleProject: true,
      });

      // Should create a workspace
      expect(result.workspaceId).toBeDefined();
      expect(result.projectId).toBeDefined();

      // Verify workspace was created
      const workspaces = await fixture.engine.testing.pool.query(
        `SELECT * FROM workspaces WHERE id = $1`,
        [result.workspaceId],
      );
      expect(workspaces.rows.length).toBe(1);

      // Verify user is a member of the workspace
      const members = await fixture.engine.testing.pool.query(
        `SELECT * FROM workspace_members WHERE workspace_id = $1 AND user_email_normalized = $2`,
        [result.workspaceId, NEW_USER_EMAIL],
      );
      expect(members.rows.length).toBe(1);
      expect(members.rows[0].role).toBe('admin');
    });

    it('creates a personal workspace without example configs when exampleProject is false', async () => {
      // Register a new user who is not part of any workspace
      const newUserIdentity = await fixture.registerUser(NEW_USER_EMAIL, 'New User');

      // Call initUser for the new user without example project
      const result = await fixture.engine.useCases.initUser(GLOBAL_CONTEXT, {
        identity: newUserIdentity,
        exampleProject: false,
      });

      // Should create a workspace and project (project is always created for workspace setup)
      expect(result.workspaceId).toBeDefined();
      expect(result.projectId).toBeDefined();

      // Verify no example configs were created in the project
      const configs = await fixture.engine.testing.pool.query(
        `SELECT * FROM configs WHERE project_id = $1`,
        [result.projectId],
      );
      expect(configs.rows.length).toBe(0);
    });
  });

  describe('when user is already part of a workspace', () => {
    it('does not create a new workspace', async () => {
      // Register a new user
      const newUserIdentity = await fixture.registerUser(NEW_USER_EMAIL, 'New User');

      // Add the new user to the fixture's existing workspace
      await fixture.engine.useCases.addWorkspaceMember(GLOBAL_CONTEXT, {
        workspaceId: fixture.workspaceId,
        identity: fixture.identity,
        memberEmail: NEW_USER_EMAIL,
        role: 'member',
      });

      // Get the current workspace count
      const beforeCount = await fixture.engine.testing.pool.query(
        `SELECT COUNT(*) as count FROM workspaces`,
      );
      const workspaceCountBefore = parseInt(beforeCount.rows[0].count, 10);

      // Call initUser for the new user
      const result = await fixture.engine.useCases.initUser(GLOBAL_CONTEXT, {
        identity: newUserIdentity,
        exampleProject: true,
      });

      // Should return the existing workspace
      expect(result.workspaceId).toBe(fixture.workspaceId);
      // Should not create a project since user already has a workspace
      expect(result.projectId).toBeUndefined();

      // Verify no new workspace was created
      const afterCount = await fixture.engine.testing.pool.query(
        `SELECT COUNT(*) as count FROM workspaces`,
      );
      const workspaceCountAfter = parseInt(afterCount.rows[0].count, 10);
      expect(workspaceCountAfter).toBe(workspaceCountBefore);
    });
  });

  describe('auto_add_new_users workspaces', () => {
    it('adds user to workspaces with auto_add_new_users enabled', async () => {
      // Create a workspace with auto_add_new_users enabled
      const {workspaceId: autoAddWorkspaceId} = await fixture.engine.useCases.createWorkspace(
        GLOBAL_CONTEXT,
        {
          identity: fixture.identity,
          name: 'Auto Add Workspace',
        },
      );

      // Enable auto_add_new_users
      await fixture.engine.testing.pool.query(
        `UPDATE workspaces SET auto_add_new_users = true WHERE id = $1`,
        [autoAddWorkspaceId],
      );

      // Register a new user
      const newUserIdentity = await fixture.registerUser(NEW_USER_EMAIL, 'New User');

      // Call initUser for the new user
      const result = await fixture.engine.useCases.initUser(GLOBAL_CONTEXT, {
        identity: newUserIdentity,
        exampleProject: true,
      });

      // User should be added to the auto-add workspace
      const autoAddMembership = await fixture.engine.testing.pool.query(
        `SELECT * FROM workspace_members WHERE workspace_id = $1 AND user_email_normalized = $2`,
        [autoAddWorkspaceId, NEW_USER_EMAIL],
      );
      expect(autoAddMembership.rows.length).toBe(1);
      expect(autoAddMembership.rows[0].role).toBe('member');

      // Since user was added to auto-add workspace, they now have a workspace
      // So no new personal workspace should be created
      expect(result.workspaceId).toBe(autoAddWorkspaceId);
      expect(result.projectId).toBeUndefined();
    });

    it('does not add user to auto_add_new_users workspace if already a member', async () => {
      // Create a workspace with auto_add_new_users enabled
      const {workspaceId: autoAddWorkspaceId} = await fixture.engine.useCases.createWorkspace(
        GLOBAL_CONTEXT,
        {
          identity: fixture.identity,
          name: 'Auto Add Workspace',
        },
      );

      // Register a new user and add them to the workspace first
      const newUserIdentity = await fixture.registerUser(NEW_USER_EMAIL, 'New User');
      await fixture.engine.useCases.addWorkspaceMember(GLOBAL_CONTEXT, {
        workspaceId: autoAddWorkspaceId,
        identity: fixture.identity,
        memberEmail: NEW_USER_EMAIL,
        role: 'admin',
      });

      // Enable auto_add_new_users AFTER user is already a member
      await fixture.engine.testing.pool.query(
        `UPDATE workspaces SET auto_add_new_users = true WHERE id = $1`,
        [autoAddWorkspaceId],
      );

      // Call initUser for the new user
      await fixture.engine.useCases.initUser(GLOBAL_CONTEXT, {
        identity: newUserIdentity,
        exampleProject: true,
      });

      // User should still be admin (not downgraded to member)
      const membership = await fixture.engine.testing.pool.query(
        `SELECT * FROM workspace_members WHERE workspace_id = $1 AND user_email_normalized = $2`,
        [autoAddWorkspaceId, NEW_USER_EMAIL],
      );
      expect(membership.rows.length).toBe(1);
      expect(membership.rows[0].role).toBe('admin');
    });
  });
});

