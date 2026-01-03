import {GLOBAL_CONTEXT} from '@/engine/core/context';
import {BadRequestError, ForbiddenError, NotFoundError} from '@/engine/core/errors';
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

const ADMIN_USER_EMAIL = normalizeEmail('admin@example.com');
const TEST_USER_EMAIL = normalizeEmail('test@example.com');

describe('deleteConfig', () => {
  const fixture = useAppFixture({authEmail: ADMIN_USER_EMAIL});

  it('should delete an existing config', async () => {
    // Create two configs
    await fixture.createConfig({
      overrides: [],
      name: 'config_to_delete',
      value: asConfigValue({enabled: true}),
      schema: asConfigSchema({type: 'object', properties: {enabled: {type: 'boolean'}}}),
      description: 'To be deleted',
      identity: fixture.identity,
      editorEmails: [],
      maintainerEmails: [ADMIN_USER_EMAIL],
      projectId: fixture.projectId,
    });

    await fixture.createConfig({
      overrides: [],
      name: 'config_to_keep',
      value: asConfigValue('keep'),
      schema: asConfigSchema({type: 'string'}),
      description: 'Should remain',
      identity: fixture.identity,
      editorEmails: [],
      maintainerEmails: [ADMIN_USER_EMAIL],
      projectId: fixture.projectId,
    });

    // Ensure both exist
    {
      const {config} = await fixture.trpc.getConfig({
        name: 'config_to_delete',
        projectId: fixture.projectId,
      });
      expect(config?.config.name).toBe('config_to_delete');
    }
    {
      const {config} = await fixture.trpc.getConfig({
        name: 'config_to_keep',
        projectId: fixture.projectId,
      });
      expect(config?.config.name).toBe('config_to_keep');
    }

    // Delete one of them
    await fixture.engine.useCases.deleteConfig(GLOBAL_CONTEXT, {
      projectId: fixture.projectId,
      configName: 'config_to_delete',
      identity: fixture.identity,
      prevVersion: 1,
    });

    // Confirm deletion
    {
      const {config} = await fixture.trpc.getConfig({
        name: 'config_to_delete',
        projectId: fixture.projectId,
      });
      expect(config).toBeUndefined();
    }

    // Other config remains
    {
      const {config} = await fixture.trpc.getConfig({
        name: 'config_to_keep',
        projectId: fixture.projectId,
      });
      expect(config?.config.name).toBe('config_to_keep');
    }

    // And list reflects the single remaining config
    const {configs} = await fixture.trpc.getConfigList({projectId: fixture.projectId});
    expect(configs.map(c => c.name)).toEqual(['config_to_keep']);
  });

  it('should throw NotFoundError when config does not exist', async () => {
    await expect(
      fixture.engine.useCases.deleteConfig(GLOBAL_CONTEXT, {
        projectId: fixture.projectId,
        configName: 'non_existent_config',
        identity: fixture.identity,
        prevVersion: 1,
      }),
    ).rejects.toBeInstanceOf(NotFoundError);
  });

  it('should throw NotFoundError on double delete', async () => {
    await fixture.createConfig({
      overrides: [],
      name: 'double_delete',
      value: asConfigValue(1),
      schema: asConfigSchema({type: 'number'}),
      description: 'double delete case',
      identity: fixture.identity,
      editorEmails: [],
      maintainerEmails: [ADMIN_USER_EMAIL],
      projectId: fixture.projectId,
    });

    await fixture.engine.useCases.deleteConfig(GLOBAL_CONTEXT, {
      projectId: fixture.projectId,
      configName: 'double_delete',
      identity: fixture.identity,
      prevVersion: 1,
    });

    await expect(
      fixture.engine.useCases.deleteConfig(GLOBAL_CONTEXT, {
        projectId: fixture.projectId,
        configName: 'double_delete',
        identity: fixture.identity,
        prevVersion: 1,
      }),
    ).rejects.toBeInstanceOf(NotFoundError);
  });

  it('should forbid delete when current user is editor (not owner)', async () => {
    // Register a non-admin user as editor
    const testUserIdentity = await fixture.registerNonAdminWorkspaceMember(TEST_USER_EMAIL);

    await fixture.createConfig({
      overrides: [],
      name: 'cannot_delete_as_editor',
      value: asConfigValue(123),
      schema: asConfigSchema({type: 'number'}),
      description: 'Editor cannot delete',
      identity: fixture.identity,
      editorEmails: [TEST_USER_EMAIL],
      maintainerEmails: ['other-owner@example.com'],
      projectId: fixture.projectId,
    });

    // Try to delete as editor (should fail)
    await expect(
      fixture.engine.useCases.deleteConfig(GLOBAL_CONTEXT, {
        projectId: fixture.projectId,
        configName: 'cannot_delete_as_editor',
        identity: testUserIdentity,
        prevVersion: 1,
      }),
    ).rejects.toBeInstanceOf(ForbiddenError);

    // Still exists
    const {config} = await fixture.trpc.getConfig({
      name: 'cannot_delete_as_editor',
      projectId: fixture.projectId,
    });
    expect(config).toBeDefined();
  });

  it('should forbid delete when current user is viewer (no membership)', async () => {
    // Register a non-admin user with no config membership (viewer)
    const testUserIdentity = await fixture.registerNonAdminWorkspaceMember(TEST_USER_EMAIL);

    await fixture.createConfig({
      overrides: [],
      name: 'cannot_delete_as_viewer',
      value: asConfigValue('v'),
      schema: asConfigSchema({type: 'string'}),
      description: 'Viewer cannot delete',
      identity: fixture.identity,
      editorEmails: [],
      maintainerEmails: ['other-owner@example.com'],
      projectId: fixture.projectId,
    });

    // Try to delete as viewer (should fail)
    await expect(
      fixture.engine.useCases.deleteConfig(GLOBAL_CONTEXT, {
        projectId: fixture.projectId,
        configName: 'cannot_delete_as_viewer',
        identity: testUserIdentity,
        prevVersion: 1,
      }),
    ).rejects.toBeInstanceOf(ForbiddenError);

    const {config} = await fixture.trpc.getConfig({
      name: 'cannot_delete_as_viewer',
      projectId: fixture.projectId,
    });
    expect(config).toBeDefined();
  });

  it('creates audit messages (config_created & config_deleted)', async () => {
    await fixture.createConfig({
      overrides: [],
      name: 'delete_audit',
      value: asConfigValue('x'),
      schema: asConfigSchema({type: 'string'}),
      description: 'audit',
      identity: fixture.identity,
      editorEmails: [],
      maintainerEmails: [ADMIN_USER_EMAIL],
      projectId: fixture.projectId,
    });

    await fixture.engine.useCases.deleteConfig(GLOBAL_CONTEXT, {
      projectId: fixture.projectId,
      configName: 'delete_audit',
      identity: fixture.identity,
      prevVersion: 1,
    });

    const messages = await fixture.engine.testing.auditLogs.list({
      lte: new Date('2100-01-01T00:00:00Z'),
      limit: 20,
      orderBy: 'created_at desc, id desc',
      projectId: fixture.projectId,
    });
    const types = messages.map(m => m.payload.type).sort();
    expect(types).toContain('config_created');
    expect(types).toContain('config_deleted');
    expect(types).toContain('project_created');

    const byType: Record<string, any> = Object.fromEntries(
      messages.map(m => [m.payload.type, m.payload]),
    );
    expect(byType.config_created.config.name).toBe('delete_audit');
    expect(byType.config_deleted.config.name).toBe('delete_audit');
    expect(byType.config_deleted.config.version).toBe(1);
  });
});

describe('deleteConfig (requireProposals=true)', () => {
  const fixture = useAppFixture({authEmail: TEST_USER_EMAIL});

  it('should forbid direct delete when requireProposals is enabled', async () => {
    // Update project to require proposals
    await fixture.engine.useCases.patchProject(GLOBAL_CONTEXT, {
      id: fixture.projectId,
      details: {
        name: 'Test Project',
        description: 'Default project for tests',
        requireProposals: true,
        allowSelfApprovals: false,
      },
      identity: fixture.identity,
    });

    await fixture.createConfig({
      overrides: [],
      name: 'cannot_delete_when_require_proposals',
      value: asConfigValue(42) as ConfigValue,
      schema: asConfigSchema({type: 'number'}),
      description: 'Test',
      identity: fixture.identity,
      editorEmails: [],
      maintainerEmails: [ADMIN_USER_EMAIL],
      projectId: fixture.projectId,
    });

    await expect(
      fixture.engine.useCases.deleteConfig(GLOBAL_CONTEXT, {
        projectId: fixture.projectId,
        configName: 'cannot_delete_when_require_proposals',
        identity: fixture.identity,
        prevVersion: 1,
      }),
    ).rejects.toBeInstanceOf(BadRequestError);
  });

  it('should forbid deletion if version mismatch', async () => {
    // Update project to require proposals
    await fixture.engine.useCases.patchProject(GLOBAL_CONTEXT, {
      id: fixture.projectId,
      details: {
        name: 'Test Project',
        description: 'Default project for tests',
        requireProposals: true,
        allowSelfApprovals: false,
      },
      identity: fixture.identity,
    });

    await fixture.createConfig({
      overrides: [],
      name: 'version_mismatch_delete',
      value: asConfigValue('test'),
      schema: asConfigSchema({type: 'string'}),
      description: 'Test',
      identity: fixture.identity,
      editorEmails: [],
      maintainerEmails: [ADMIN_USER_EMAIL],
      projectId: fixture.projectId,
    });

    await expect(
      fixture.engine.useCases.deleteConfig(GLOBAL_CONTEXT, {
        projectId: fixture.projectId,
        configName: 'version_mismatch_delete',
        identity: fixture.identity,
        prevVersion: 2, // incorrect version
      }),
    ).rejects.toBeInstanceOf(BadRequestError);
  });
});
