import {GLOBAL_CONTEXT} from '@/engine/core/context';
import {ForbiddenError} from '@/engine/core/errors';
import {normalizeEmail, stringifyJsonc} from '@/engine/core/utils';
import type {ConfigSchema, ConfigValue} from '@/engine/core/zod';
import {describe, expect, it} from 'vitest';
import {useAppFixture} from './fixtures/app-fixture';

function asConfigValue(value: unknown): ConfigValue {
  return stringifyJsonc(value) as ConfigValue;
}

function asConfigSchema(value: unknown): ConfigSchema {
  return stringifyJsonc(value) as ConfigSchema;
}

const WORKSPACE_ADMIN_EMAIL = normalizeEmail('workspace-admin@example.com');
const WORKSPACE_MEMBER_EMAIL = normalizeEmail('workspace-member@example.com');
const NON_MEMBER_EMAIL = normalizeEmail('non-member@example.com');

describe('Workspace Admin Permissions', () => {
  const fixture = useAppFixture({authEmail: WORKSPACE_ADMIN_EMAIL});

  // ============================================================================
  // Project Operations
  // ============================================================================

  describe('projects', () => {
    it('workspace admin can create a project', async () => {
      const {projectId} = await fixture.engine.useCases.createProject(GLOBAL_CONTEXT, {
        identity: fixture.identity,
        workspaceId: fixture.workspaceId,
        name: 'Admin Created Project',
        description: 'Created by workspace admin',
      });

      expect(projectId).toBeDefined();

      const {project} = await fixture.engine.useCases.getProject(GLOBAL_CONTEXT, {
        id: projectId,
        identity: fixture.identity,
      });

      expect(project?.name).toBe('Admin Created Project');
    });

    it('workspace admin can view any project in workspace', async () => {
      const {project} = await fixture.engine.useCases.getProject(GLOBAL_CONTEXT, {
        id: fixture.projectId,
        identity: fixture.identity,
      });

      expect(project).toBeDefined();
      expect(project?.myRole).toBe('admin');
    });

    it('workspace admin can update any project in workspace', async () => {
      await fixture.engine.useCases.patchProject(GLOBAL_CONTEXT, {
        id: fixture.projectId,
        identity: fixture.identity,
        details: {
          name: 'Updated by Admin',
          description: 'Updated description',
          requireProposals: false,
          allowSelfApprovals: true,
        },
      });

      const {project} = await fixture.engine.useCases.getProject(GLOBAL_CONTEXT, {
        id: fixture.projectId,
        identity: fixture.identity,
      });

      expect(project?.name).toBe('Updated by Admin');
    });

    it('workspace admin can delete a project', async () => {
      // Create a project to delete
      const {projectId} = await fixture.engine.useCases.createProject(GLOBAL_CONTEXT, {
        identity: fixture.identity,
        workspaceId: fixture.workspaceId,
        name: 'Project To Delete',
        description: 'Will be deleted',
      });

      await fixture.engine.useCases.deleteProject(GLOBAL_CONTEXT, {
        id: projectId,
        confirmName: 'Project To Delete',
        identity: fixture.identity,
      });

      // Verify project was deleted using raw query
      const res = await fixture.engine.testing.pool.query(`SELECT * FROM projects WHERE id = $1`, [
        projectId,
      ]);
      expect(res.rows).toHaveLength(0);
    });

    it('workspace admin can manage project members', async () => {
      const newMemberEmail = 'new-member@example.com';
      await fixture.registerUser(newMemberEmail);
      await fixture.engine.useCases.addWorkspaceMember(GLOBAL_CONTEXT, {
        workspaceId: fixture.workspaceId,
        identity: fixture.identity,
        memberEmail: newMemberEmail,
        role: 'member',
      });

      await fixture.engine.useCases.patchProject(GLOBAL_CONTEXT, {
        id: fixture.projectId,
        identity: fixture.identity,
        members: {
          users: [{email: newMemberEmail, role: 'admin'}],
        },
      });

      // Verify using raw query
      const res = await fixture.engine.testing.pool.query(
        `SELECT * FROM project_users WHERE project_id = $1 AND user_email_normalized = $2`,
        [fixture.projectId, newMemberEmail],
      );
      expect(res.rows).toHaveLength(1);
      expect(res.rows[0].role).toBe('admin');
    });
  });

  // ============================================================================
  // Config Operations
  // ============================================================================

  describe('configs', () => {
    it('workspace admin can create a config', async () => {
      const {configId} = await fixture.createConfig({
        name: 'admin-created-config',
        value: asConfigValue('test'),
        schema: asConfigSchema({type: 'string'}),
        overrides: [],
        description: 'Created by admin',
        identity: fixture.identity,
        editorEmails: [],
        maintainerEmails: [],
        projectId: fixture.projectId,
      });

      expect(configId).toBeDefined();
    });

    it('workspace admin can view any config', async () => {
      await fixture.createConfig({
        name: 'view-test-config',
        value: asConfigValue(123),
        schema: asConfigSchema({type: 'number'}),
        overrides: [],
        description: 'Test config',
        identity: fixture.identity,
        editorEmails: [],
        maintainerEmails: [],
        projectId: fixture.projectId,
      });

      const {config} = await fixture.engine.useCases.getConfig(GLOBAL_CONTEXT, {
        name: 'view-test-config',
        projectId: fixture.projectId,
        identity: fixture.identity,
      });

      expect(config).toBeDefined();
      expect(config?.myRole).toBe('maintainer');
    });

    it('workspace admin can update any config', async () => {
      await fixture.createConfig({
        name: 'update-test-config',
        value: asConfigValue('original'),
        schema: asConfigSchema({type: 'string'}),
        overrides: [],
        description: 'Original description',
        identity: fixture.identity,
        editorEmails: [],
        maintainerEmails: [],
        projectId: fixture.projectId,
      });

      const {config} = await fixture.engine.useCases.getConfig(GLOBAL_CONTEXT, {
        name: 'update-test-config',
        projectId: fixture.projectId,
        identity: fixture.identity,
      });

      await fixture.engine.useCases.updateConfig(GLOBAL_CONTEXT, {
        projectId: fixture.projectId,
        identity: fixture.identity,
        configName: 'update-test-config',
        description: 'Updated description',
        editors: [],
        maintainers: [],
        prevVersion: config!.config.version,
        base: {
          value: asConfigValue('updated'),
          schema: asConfigSchema({type: 'string'}),
          overrides: [],
        },
        environments: config!.variants.map(v => ({
          environmentId: v.environmentId,
          value: asConfigValue('updated'),
          schema: asConfigSchema({type: 'string'}),
          overrides: [],
          useBaseSchema: false,
        })),
      });

      const {config: updated} = await fixture.engine.useCases.getConfig(GLOBAL_CONTEXT, {
        name: 'update-test-config',
        projectId: fixture.projectId,
        identity: fixture.identity,
      });

      const prodVariant = updated?.variants.find(v => v.environmentName === 'Production');
      expect(prodVariant?.value).toBe(stringifyJsonc('updated'));
    });

    it('workspace admin can delete any config', async () => {
      await fixture.createConfig({
        name: 'delete-test-config',
        value: asConfigValue(true),
        schema: asConfigSchema({type: 'boolean'}),
        overrides: [],
        description: 'To be deleted',
        identity: fixture.identity,
        editorEmails: [],
        maintainerEmails: [],
        projectId: fixture.projectId,
      });

      await fixture.engine.useCases.deleteConfig(GLOBAL_CONTEXT, {
        projectId: fixture.projectId,
        configName: 'delete-test-config',
        identity: fixture.identity,
        prevVersion: 1,
      });

      const {config} = await fixture.engine.useCases.getConfig(GLOBAL_CONTEXT, {
        name: 'delete-test-config',
        projectId: fixture.projectId,
        identity: fixture.identity,
      });

      expect(config).toBeUndefined();
    });
  });

  // ============================================================================
  // SDK Key Operations
  // ============================================================================

  describe('SDK keys', () => {
    it('workspace admin can create SDK key', async () => {
      const {sdkKey} = await fixture.engine.useCases.createSdkKey(GLOBAL_CONTEXT, {
        projectId: fixture.projectId,
        environmentId: fixture.productionEnvironmentId,
        identity: fixture.identity,
        name: 'Admin SDK Key',
        description: 'Created by admin',
      });

      expect(sdkKey.id).toBeDefined();
      expect(sdkKey.token).toBeDefined();
    });

    it('workspace admin can view SDK keys', async () => {
      await fixture.engine.useCases.createSdkKey(GLOBAL_CONTEXT, {
        projectId: fixture.projectId,
        environmentId: fixture.productionEnvironmentId,
        identity: fixture.identity,
        name: 'View Test Key',
        description: 'Test',
      });

      const {sdkKeys} = await fixture.engine.useCases.getSdkKeyList(GLOBAL_CONTEXT, {
        projectId: fixture.projectId,
        identity: fixture.identity,
      });

      expect(sdkKeys.length).toBeGreaterThan(0);
    });

    it('workspace admin can delete SDK key', async () => {
      const {sdkKey} = await fixture.engine.useCases.createSdkKey(GLOBAL_CONTEXT, {
        projectId: fixture.projectId,
        environmentId: fixture.productionEnvironmentId,
        identity: fixture.identity,
        name: 'Delete Test Key',
        description: 'To be deleted',
      });

      const sdkKeyId = sdkKey.id;

      await fixture.engine.useCases.deleteSdkKey(GLOBAL_CONTEXT, {
        id: sdkKeyId,
        projectId: fixture.projectId,
        identity: fixture.identity,
      });

      const {sdkKeys} = await fixture.engine.useCases.getSdkKeyList(GLOBAL_CONTEXT, {
        projectId: fixture.projectId,
        identity: fixture.identity,
      });

      expect(sdkKeys.find(k => k.id === sdkKeyId)).toBeUndefined();
    });
  });

  // ============================================================================
  // Environment Operations
  // ============================================================================

  describe('environments', () => {
    it('workspace admin can create environment', async () => {
      await fixture.engine.useCases.createProjectEnvironment(GLOBAL_CONTEXT, {
        projectId: fixture.projectId,
        identity: fixture.identity,
        name: 'Staging',
        copyFromEnvironmentId: fixture.productionEnvironmentId,
      });

      const {environments} = await fixture.engine.useCases.getProjectEnvironments(GLOBAL_CONTEXT, {
        projectId: fixture.projectId,
        identity: fixture.identity,
      });

      expect(environments.some(e => e.name === 'Staging')).toBe(true);
    });
  });
});

describe('Project Admin Permissions (Non-Workspace-Admin)', () => {
  const fixture = useAppFixture({authEmail: WORKSPACE_ADMIN_EMAIL});

  // ============================================================================
  // Setup: Create a project admin who is NOT a workspace admin
  // ============================================================================

  async function setupProjectAdmin() {
    const projectAdminIdentity = await fixture.registerNonAdminWorkspaceMember(
      'project-admin@example.com',
    );

    // Add as project admin
    await fixture.engine.useCases.patchProject(GLOBAL_CONTEXT, {
      id: fixture.projectId,
      identity: fixture.identity,
      members: {users: [{email: 'project-admin@example.com', role: 'admin'}]},
    });

    return projectAdminIdentity;
  }

  // ============================================================================
  // Config Operations
  // ============================================================================

  describe('configs', () => {
    it('project admin can create config', async () => {
      const projectAdminIdentity = await setupProjectAdmin();

      const {configId} = await fixture.createConfig({
        name: 'project-admin-config',
        value: asConfigValue('test'),
        schema: asConfigSchema({type: 'string'}),
        overrides: [],
        description: 'Created by project admin',
        identity: projectAdminIdentity,
        editorEmails: [],
        maintainerEmails: [],
        projectId: fixture.projectId,
      });

      expect(configId).toBeDefined();
    });

    it('project admin can view configs with maintainer role', async () => {
      const projectAdminIdentity = await setupProjectAdmin();

      await fixture.createConfig({
        name: 'view-as-project-admin',
        value: asConfigValue(123),
        schema: asConfigSchema({type: 'number'}),
        overrides: [],
        description: 'Test',
        identity: fixture.identity,
        editorEmails: [],
        maintainerEmails: [],
        projectId: fixture.projectId,
      });

      const {config} = await fixture.engine.useCases.getConfig(GLOBAL_CONTEXT, {
        name: 'view-as-project-admin',
        projectId: fixture.projectId,
        identity: projectAdminIdentity,
      });

      expect(config?.myRole).toBe('maintainer');
    });

    it('project admin can update configs', async () => {
      const projectAdminIdentity = await setupProjectAdmin();

      await fixture.createConfig({
        name: 'update-as-project-admin',
        value: asConfigValue('original'),
        schema: asConfigSchema({type: 'string'}),
        overrides: [],
        description: 'Test',
        identity: fixture.identity,
        editorEmails: [],
        maintainerEmails: [],
        projectId: fixture.projectId,
      });

      const {config} = await fixture.engine.useCases.getConfig(GLOBAL_CONTEXT, {
        name: 'update-as-project-admin',
        projectId: fixture.projectId,
        identity: projectAdminIdentity,
      });

      await fixture.engine.useCases.updateConfig(GLOBAL_CONTEXT, {
        projectId: fixture.projectId,
        identity: projectAdminIdentity,
        configName: 'update-as-project-admin',
        description: 'Updated by project admin',
        editors: [],
        maintainers: [],
        prevVersion: config!.config.version,
        base: {
          value: asConfigValue('updated by project admin'),
          schema: asConfigSchema({type: 'string'}),
          overrides: [],
        },
        environments: config!.variants.map(v => ({
          environmentId: v.environmentId,
          value: asConfigValue('updated by project admin'),
          schema: asConfigSchema({type: 'string'}),
          overrides: [],
          useBaseSchema: false,
        })),
      });

      const {config: updated} = await fixture.engine.useCases.getConfig(GLOBAL_CONTEXT, {
        name: 'update-as-project-admin',
        projectId: fixture.projectId,
        identity: projectAdminIdentity,
      });

      const prodVariant = updated?.variants.find(v => v.environmentName === 'Production');
      expect(prodVariant?.value).toBe(stringifyJsonc('updated by project admin'));
    });

    it('project admin can delete configs', async () => {
      const projectAdminIdentity = await setupProjectAdmin();

      await fixture.createConfig({
        name: 'delete-as-project-admin',
        value: asConfigValue(true),
        schema: asConfigSchema({type: 'boolean'}),
        overrides: [],
        description: 'To delete',
        identity: fixture.identity,
        editorEmails: [],
        maintainerEmails: [],
        projectId: fixture.projectId,
      });

      await fixture.engine.useCases.deleteConfig(GLOBAL_CONTEXT, {
        projectId: fixture.projectId,
        configName: 'delete-as-project-admin',
        identity: projectAdminIdentity,
        prevVersion: 1,
      });

      const {config} = await fixture.engine.useCases.getConfig(GLOBAL_CONTEXT, {
        name: 'delete-as-project-admin',
        projectId: fixture.projectId,
        identity: projectAdminIdentity,
      });

      expect(config).toBeUndefined();
    });
  });

  // ============================================================================
  // SDK Key Operations
  // ============================================================================

  describe('SDK keys', () => {
    it('project admin can create SDK key', async () => {
      const projectAdminIdentity = await setupProjectAdmin();

      const {sdkKey} = await fixture.engine.useCases.createSdkKey(GLOBAL_CONTEXT, {
        projectId: fixture.projectId,
        environmentId: fixture.productionEnvironmentId,
        identity: projectAdminIdentity,
        name: 'Project Admin Key',
        description: 'Created by project admin',
      });

      expect(sdkKey.id).toBeDefined();
    });

    it('project admin can view SDK keys', async () => {
      const projectAdminIdentity = await setupProjectAdmin();

      const {sdkKeys} = await fixture.engine.useCases.getSdkKeyList(GLOBAL_CONTEXT, {
        projectId: fixture.projectId,
        identity: projectAdminIdentity,
      });

      expect(sdkKeys).toBeDefined();
    });

    it('project admin can delete SDK key', async () => {
      const projectAdminIdentity = await setupProjectAdmin();

      const {sdkKey} = await fixture.engine.useCases.createSdkKey(GLOBAL_CONTEXT, {
        projectId: fixture.projectId,
        environmentId: fixture.productionEnvironmentId,
        identity: projectAdminIdentity,
        name: 'To Delete By Project Admin',
        description: 'Test',
      });

      const sdkKeyId = sdkKey.id;

      await fixture.engine.useCases.deleteSdkKey(GLOBAL_CONTEXT, {
        id: sdkKeyId,
        projectId: fixture.projectId,
        identity: projectAdminIdentity,
      });

      const {sdkKeys} = await fixture.engine.useCases.getSdkKeyList(GLOBAL_CONTEXT, {
        projectId: fixture.projectId,
        identity: projectAdminIdentity,
      });

      expect(sdkKeys.find(k => k.id === sdkKeyId)).toBeUndefined();
    });
  });

  // ============================================================================
  // Project Operations
  // ============================================================================

  describe('projects', () => {
    it('project admin can update project details', async () => {
      const projectAdminIdentity = await setupProjectAdmin();

      await fixture.engine.useCases.patchProject(GLOBAL_CONTEXT, {
        id: fixture.projectId,
        identity: projectAdminIdentity,
        details: {
          name: 'Updated by Project Admin',
          description: 'Updated',
          requireProposals: false,
          allowSelfApprovals: true,
        },
      });

      const {project} = await fixture.engine.useCases.getProject(GLOBAL_CONTEXT, {
        id: fixture.projectId,
        identity: projectAdminIdentity,
      });

      expect(project?.name).toBe('Updated by Project Admin');
    });

    it('project admin can manage project members', async () => {
      const projectAdminIdentity = await setupProjectAdmin();

      const anotherMemberEmail = 'another-member@example.com';
      await fixture.registerUser(anotherMemberEmail);
      await fixture.engine.useCases.addWorkspaceMember(GLOBAL_CONTEXT, {
        workspaceId: fixture.workspaceId,
        identity: fixture.identity,
        memberEmail: anotherMemberEmail,
        role: 'member',
      });

      await fixture.engine.useCases.patchProject(GLOBAL_CONTEXT, {
        id: fixture.projectId,
        identity: projectAdminIdentity,
        members: {
          users: [
            {email: 'project-admin@example.com', role: 'admin'},
            {email: anotherMemberEmail, role: 'maintainer'},
          ],
        },
      });

      // Verify using raw query
      const res = await fixture.engine.testing.pool.query(
        `SELECT * FROM project_users WHERE project_id = $1 AND user_email_normalized = $2`,
        [fixture.projectId, anotherMemberEmail],
      );
      expect(res.rows).toHaveLength(1);
      expect(res.rows[0].role).toBe('maintainer');
    });

    it('project admin can delete project they own', async () => {
      const projectAdminIdentity = await setupProjectAdmin();

      // Create a new project
      const {projectId} = await fixture.engine.useCases.createProject(GLOBAL_CONTEXT, {
        identity: fixture.identity,
        workspaceId: fixture.workspaceId,
        name: 'Delete By Project Admin',
        description: 'Test',
      });

      // Make project-admin the admin of this project
      await fixture.engine.useCases.patchProject(GLOBAL_CONTEXT, {
        id: projectId,
        identity: fixture.identity,
        members: {users: [{email: 'project-admin@example.com', role: 'admin'}]},
      });

      await fixture.engine.useCases.deleteProject(GLOBAL_CONTEXT, {
        id: projectId,
        confirmName: 'Delete By Project Admin',
        identity: projectAdminIdentity,
      });

      // Verify project was deleted using raw query
      const res = await fixture.engine.testing.pool.query(`SELECT * FROM projects WHERE id = $1`, [
        projectId,
      ]);
      expect(res.rows).toHaveLength(0);
    });
  });
});

describe('Workspace Member Permissions', () => {
  const fixture = useAppFixture({authEmail: WORKSPACE_ADMIN_EMAIL});

  it('any workspace member can create a project', async () => {
    const memberIdentity = await fixture.registerNonAdminWorkspaceMember(WORKSPACE_MEMBER_EMAIL);

    const {projectId} = await fixture.engine.useCases.createProject(GLOBAL_CONTEXT, {
      identity: memberIdentity,
      workspaceId: fixture.workspaceId,
      name: 'Member Created Project',
      description: 'Created by regular member',
    });

    expect(projectId).toBeDefined();

    const {project} = await fixture.engine.useCases.getProject(GLOBAL_CONTEXT, {
      id: projectId,
      identity: memberIdentity,
    });

    expect(project?.name).toBe('Member Created Project');
    // Creator becomes project admin
    expect(project?.myRole).toBe('admin');
  });

  it('workspace member can view projects in workspace', async () => {
    const memberIdentity = await fixture.registerNonAdminWorkspaceMember(WORKSPACE_MEMBER_EMAIL);

    const {project} = await fixture.engine.useCases.getProject(GLOBAL_CONTEXT, {
      id: fixture.projectId,
      identity: memberIdentity,
    });

    expect(project).toBeDefined();
    // Regular member with no project role should have null myRole
    expect(project?.myRole).toBeNull();
  });

  it('workspace member (viewer) cannot update project they do not own', async () => {
    const memberIdentity = await fixture.registerNonAdminWorkspaceMember(WORKSPACE_MEMBER_EMAIL);

    await expect(
      fixture.engine.useCases.patchProject(GLOBAL_CONTEXT, {
        id: fixture.projectId,
        identity: memberIdentity,
        details: {
          name: 'Should Fail',
          description: 'Test',
          requireProposals: false,
          allowSelfApprovals: true,
        },
      }),
    ).rejects.toBeInstanceOf(ForbiddenError);
  });

  it('workspace member (viewer) cannot delete project they do not own', async () => {
    const memberIdentity = await fixture.registerNonAdminWorkspaceMember(WORKSPACE_MEMBER_EMAIL);

    await expect(
      fixture.engine.useCases.deleteProject(GLOBAL_CONTEXT, {
        id: fixture.projectId,
        confirmName: 'Test Project',
        identity: memberIdentity,
      }),
    ).rejects.toBeInstanceOf(ForbiddenError);
  });

  it('workspace member can view configs', async () => {
    const memberIdentity = await fixture.registerNonAdminWorkspaceMember(WORKSPACE_MEMBER_EMAIL);

    await fixture.createConfig({
      name: 'member-view-config',
      value: asConfigValue('test'),
      schema: asConfigSchema({type: 'string'}),
      overrides: [],
      description: 'Test',
      identity: fixture.identity,
      editorEmails: [],
      maintainerEmails: [],
      projectId: fixture.projectId,
    });

    const {config} = await fixture.engine.useCases.getConfig(GLOBAL_CONTEXT, {
      name: 'member-view-config',
      projectId: fixture.projectId,
      identity: memberIdentity,
    });

    expect(config).toBeDefined();
    expect(config?.myRole).toBe('viewer');
  });

  it('workspace member (viewer) cannot create config', async () => {
    const memberIdentity = await fixture.registerNonAdminWorkspaceMember(WORKSPACE_MEMBER_EMAIL);

    await expect(
      fixture.createConfig({
        name: 'should-fail-config',
        value: asConfigValue('test'),
        schema: asConfigSchema({type: 'string'}),
        overrides: [],
        description: 'Test',
        identity: memberIdentity,
        editorEmails: [],
        maintainerEmails: [],
        projectId: fixture.projectId,
      }),
    ).rejects.toBeInstanceOf(ForbiddenError);
  });

  it('workspace member (viewer) cannot update config', async () => {
    const memberIdentity = await fixture.registerNonAdminWorkspaceMember(WORKSPACE_MEMBER_EMAIL);

    await fixture.createConfig({
      name: 'no-update-config',
      value: asConfigValue('test'),
      schema: asConfigSchema({type: 'string'}),
      overrides: [],
      description: 'Test',
      identity: fixture.identity,
      editorEmails: [],
      maintainerEmails: [],
      projectId: fixture.projectId,
    });

    const {config} = await fixture.engine.useCases.getConfig(GLOBAL_CONTEXT, {
      name: 'no-update-config',
      projectId: fixture.projectId,
      identity: memberIdentity,
    });

    await expect(
      fixture.engine.useCases.updateConfig(GLOBAL_CONTEXT, {
        projectId: fixture.projectId,
        identity: memberIdentity,
        configName: 'no-update-config',
        description: 'Should fail',
        editors: [],
        maintainers: [],
        prevVersion: config!.config.version,
        base: {
          value: asConfigValue('should fail'),
          schema: asConfigSchema({type: 'string'}),
          overrides: [],
        },
        environments: config!.variants.map(v => ({
          environmentId: v.environmentId,
          value: asConfigValue('should fail'),
          schema: asConfigSchema({type: 'string'}),
          overrides: [],
          useBaseSchema: false,
        })),
      }),
    ).rejects.toBeInstanceOf(ForbiddenError);
  });

  it('workspace member (viewer) cannot delete config', async () => {
    const memberIdentity = await fixture.registerNonAdminWorkspaceMember(WORKSPACE_MEMBER_EMAIL);

    await fixture.createConfig({
      name: 'no-delete-config',
      value: asConfigValue('test'),
      schema: asConfigSchema({type: 'string'}),
      overrides: [],
      description: 'Test',
      identity: fixture.identity,
      editorEmails: [],
      maintainerEmails: [],
      projectId: fixture.projectId,
    });

    await expect(
      fixture.engine.useCases.deleteConfig(GLOBAL_CONTEXT, {
        projectId: fixture.projectId,
        configName: 'no-delete-config',
        identity: memberIdentity,
        prevVersion: 1,
      }),
    ).rejects.toBeInstanceOf(ForbiddenError);
  });

  it('workspace member (viewer) cannot create SDK key', async () => {
    const memberIdentity = await fixture.registerNonAdminWorkspaceMember(WORKSPACE_MEMBER_EMAIL);

    await expect(
      fixture.engine.useCases.createSdkKey(GLOBAL_CONTEXT, {
        projectId: fixture.projectId,
        environmentId: fixture.productionEnvironmentId,
        identity: memberIdentity,
        name: 'Should Fail',
        description: 'Test',
      }),
    ).rejects.toBeInstanceOf(ForbiddenError);
  });
});

describe('Non-Workspace Member Permissions', () => {
  const fixture = useAppFixture({authEmail: WORKSPACE_ADMIN_EMAIL});

  it('non-member cannot create project in workspace', async () => {
    // Register a user who is NOT added to the workspace
    const nonMemberIdentity = await fixture.registerUser(NON_MEMBER_EMAIL);

    await expect(
      fixture.engine.useCases.createProject(GLOBAL_CONTEXT, {
        identity: nonMemberIdentity,
        workspaceId: fixture.workspaceId,
        name: 'Should Fail',
        description: 'Test',
      }),
    ).rejects.toBeInstanceOf(ForbiddenError);
  });

  it('non-member cannot view projects in workspace', async () => {
    const nonMemberIdentity = await fixture.registerUser(NON_MEMBER_EMAIL);

    await expect(
      fixture.engine.useCases.getProject(GLOBAL_CONTEXT, {
        id: fixture.projectId,
        identity: nonMemberIdentity,
      }),
    ).rejects.toBeInstanceOf(ForbiddenError);
  });

  it('non-member cannot view configs', async () => {
    const nonMemberIdentity = await fixture.registerUser(NON_MEMBER_EMAIL);

    await fixture.createConfig({
      name: 'non-member-test',
      value: asConfigValue('test'),
      schema: asConfigSchema({type: 'string'}),
      overrides: [],
      description: 'Test',
      identity: fixture.identity,
      editorEmails: [],
      maintainerEmails: [],
      projectId: fixture.projectId,
    });

    await expect(
      fixture.engine.useCases.getConfig(GLOBAL_CONTEXT, {
        name: 'non-member-test',
        projectId: fixture.projectId,
        identity: nonMemberIdentity,
      }),
    ).rejects.toBeInstanceOf(ForbiddenError);
  });

  it('non-member cannot view SDK keys', async () => {
    const nonMemberIdentity = await fixture.registerUser(NON_MEMBER_EMAIL);

    await expect(
      fixture.engine.useCases.getSdkKeyList(GLOBAL_CONTEXT, {
        projectId: fixture.projectId,
        identity: nonMemberIdentity,
      }),
    ).rejects.toBeInstanceOf(ForbiddenError);
  });
});

describe('Config-Level Permissions', () => {
  const fixture = useAppFixture({authEmail: WORKSPACE_ADMIN_EMAIL});

  it('config editor has correct role', async () => {
    const editorEmail = normalizeEmail('editor@example.com');
    const editorIdentity = await fixture.registerNonAdminWorkspaceMember(editorEmail);

    await fixture.createConfig({
      name: 'editor-role-test',
      value: asConfigValue('test'),
      schema: asConfigSchema({type: 'string'}),
      overrides: [],
      description: 'Test',
      identity: fixture.identity,
      editorEmails: [editorEmail],
      maintainerEmails: [],
      projectId: fixture.projectId,
    });

    const {config} = await fixture.engine.useCases.getConfig(GLOBAL_CONTEXT, {
      name: 'editor-role-test',
      projectId: fixture.projectId,
      identity: editorIdentity,
    });

    expect(config?.myRole).toBe('editor');
  });

  it('config editor cannot delete config', async () => {
    const editorEmail = 'editor2@example.com';
    const editorIdentity = await fixture.registerNonAdminWorkspaceMember(editorEmail);

    await fixture.createConfig({
      name: 'editor-cannot-delete',
      value: asConfigValue('test'),
      schema: asConfigSchema({type: 'string'}),
      overrides: [],
      description: 'Test',
      identity: fixture.identity,
      editorEmails: [editorEmail],
      maintainerEmails: [],
      projectId: fixture.projectId,
    });

    await expect(
      fixture.engine.useCases.deleteConfig(GLOBAL_CONTEXT, {
        projectId: fixture.projectId,
        configName: 'editor-cannot-delete',
        identity: editorIdentity,
        prevVersion: 1,
      }),
    ).rejects.toBeInstanceOf(ForbiddenError);
  });

  it('config maintainer can delete config', async () => {
    const maintainerEmail = 'maintainer@example.com';
    const maintainerIdentity = await fixture.registerNonAdminWorkspaceMember(maintainerEmail);

    await fixture.createConfig({
      name: 'maintainer-can-delete',
      value: asConfigValue('test'),
      schema: asConfigSchema({type: 'string'}),
      overrides: [],
      description: 'Test',
      identity: fixture.identity,
      editorEmails: [],
      maintainerEmails: [maintainerEmail],
      projectId: fixture.projectId,
    });

    await fixture.engine.useCases.deleteConfig(GLOBAL_CONTEXT, {
      projectId: fixture.projectId,
      configName: 'maintainer-can-delete',
      identity: maintainerIdentity,
      prevVersion: 1,
    });

    const {config} = await fixture.engine.useCases.getConfig(GLOBAL_CONTEXT, {
      name: 'maintainer-can-delete',
      projectId: fixture.projectId,
      identity: maintainerIdentity,
    });

    expect(config).toBeUndefined();
  });
});
