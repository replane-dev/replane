import {GLOBAL_CONTEXT} from '@/engine/core/context';
import {BadRequestError, ForbiddenError} from '@/engine/core/errors';
import {normalizeEmail} from '@/engine/core/utils';
import {describe, expect, it} from 'vitest';
import {useAppFixture} from './fixtures/trpc-fixture';

const TEST_USER_EMAIL = normalizeEmail('test@example.com');

describe('deleteConfig', () => {
  const fixture = useAppFixture({authEmail: TEST_USER_EMAIL});

  it('should delete an existing config', async () => {
    // Create two configs
    const {configId: deleteId} = await fixture.engine.useCases.createConfig(GLOBAL_CONTEXT, {
      name: 'config_to_delete',
      value: {enabled: true},
      schema: {type: 'object', properties: {enabled: {type: 'boolean'}}},
      description: 'To be deleted',
      currentUserEmail: TEST_USER_EMAIL,
      editorEmails: [],
      ownerEmails: [TEST_USER_EMAIL],
      projectId: fixture.projectId,
    });

    const {configId: keepId} = await fixture.engine.useCases.createConfig(GLOBAL_CONTEXT, {
      name: 'config_to_keep',
      value: 'keep',
      schema: {type: 'string'},
      description: 'Should remain',
      currentUserEmail: TEST_USER_EMAIL,
      editorEmails: [],
      ownerEmails: [TEST_USER_EMAIL],
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
      configId: deleteId,
      currentUserEmail: TEST_USER_EMAIL,
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

  it('should throw BadRequestError when config does not exist', async () => {
    await expect(
      fixture.engine.useCases.deleteConfig(GLOBAL_CONTEXT, {
        configId: '00000000-0000-0000-0000-000000000000', // non-existent id
        currentUserEmail: TEST_USER_EMAIL,
        prevVersion: 1,
      }),
    ).rejects.toBeInstanceOf(BadRequestError);
  });

  it('should throw BadRequestError on double delete', async () => {
    const {configId} = await fixture.engine.useCases.createConfig(GLOBAL_CONTEXT, {
      name: 'double_delete',
      value: 1,
      schema: {type: 'number'},
      description: 'double delete case',
      currentUserEmail: TEST_USER_EMAIL,
      editorEmails: [],
      ownerEmails: [TEST_USER_EMAIL],
      projectId: fixture.projectId,
    });

    await fixture.engine.useCases.deleteConfig(GLOBAL_CONTEXT, {
      configId,
      currentUserEmail: TEST_USER_EMAIL,
      prevVersion: 1,
    });

    await expect(
      fixture.engine.useCases.deleteConfig(GLOBAL_CONTEXT, {
        configId,
        currentUserEmail: TEST_USER_EMAIL,
        prevVersion: 1,
      }),
    ).rejects.toBeInstanceOf(BadRequestError);
  });

  it('should forbid delete when current user is editor (not owner)', async () => {
    const {configId} = await fixture.engine.useCases.createConfig(GLOBAL_CONTEXT, {
      name: 'cannot_delete_as_editor',
      value: 123,
      schema: {type: 'number'},
      description: 'Editor cannot delete',
      currentUserEmail: TEST_USER_EMAIL,
      editorEmails: [TEST_USER_EMAIL],
      ownerEmails: ['other-owner@example.com'],
      projectId: fixture.projectId,
    });

    await fixture.engine.useCases.patchProject(GLOBAL_CONTEXT, {
      currentUserEmail: TEST_USER_EMAIL,
      id: fixture.projectId,
      members: {users: [{email: 'some-other-user@example.com', role: 'owner'}]},
    });

    await expect(
      fixture.engine.useCases.deleteConfig(GLOBAL_CONTEXT, {
        configId,
        currentUserEmail: TEST_USER_EMAIL,
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
    const {configId} = await fixture.engine.useCases.createConfig(GLOBAL_CONTEXT, {
      name: 'cannot_delete_as_viewer',
      value: 'v',
      schema: {type: 'string'},
      description: 'Viewer cannot delete',
      currentUserEmail: TEST_USER_EMAIL,
      editorEmails: [],
      ownerEmails: ['other-owner@example.com'],
      projectId: fixture.projectId,
    });

    await fixture.engine.useCases.patchProject(GLOBAL_CONTEXT, {
      currentUserEmail: TEST_USER_EMAIL,
      id: fixture.projectId,
      members: {users: [{email: 'some-other-user@example.com', role: 'owner'}]},
    });

    await expect(
      fixture.engine.useCases.deleteConfig(GLOBAL_CONTEXT, {
        configId,
        currentUserEmail: TEST_USER_EMAIL,
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
    const {configId} = await fixture.engine.useCases.createConfig(GLOBAL_CONTEXT, {
      name: 'delete_audit',
      value: 'x',
      schema: {type: 'string'},
      description: 'audit',
      currentUserEmail: TEST_USER_EMAIL,
      editorEmails: [],
      ownerEmails: [TEST_USER_EMAIL],
      projectId: fixture.projectId,
    });

    await fixture.engine.useCases.deleteConfig(GLOBAL_CONTEXT, {
      configId,
      currentUserEmail: TEST_USER_EMAIL,
      prevVersion: 1,
    });

    const messages = await fixture.engine.testing.auditMessages.list({
      lte: new Date('2100-01-01T00:00:00Z'),
      limit: 10,
      orderBy: 'created_at desc, id desc',
      projectId: fixture.projectId,
    });
    const types = messages.map(m => m.payload.type).sort();
    expect(types).toEqual(['config_created', 'config_deleted', 'project_created']);
    const byType: Record<string, any> = Object.fromEntries(
      messages.map(m => [m.payload.type, m.payload]),
    );
    expect(byType.config_created.config.name).toBe('delete_audit');
    expect(byType.config_deleted.config.name).toBe('delete_audit');
    expect(byType.config_deleted.config.value).toBe('x');
    expect(byType.config_deleted.config.version).toBe(1);
  });
});

describe('deleteConfig (requireProposals=true)', () => {
  const fixture = useAppFixture({authEmail: TEST_USER_EMAIL, requireProposals: true});

  it('should forbid direct delete when requireProposals is enabled', async () => {
    const {configId} = await fixture.engine.useCases.createConfig(GLOBAL_CONTEXT, {
      name: 'cannot_delete_when_require_proposals',
      value: 42,
      schema: {type: 'number'},
      description: 'Test',
      currentUserEmail: TEST_USER_EMAIL,
      editorEmails: [],
      ownerEmails: [TEST_USER_EMAIL],
      projectId: fixture.projectId,
    });

    await expect(
      fixture.engine.useCases.deleteConfig(GLOBAL_CONTEXT, {
        configId,
        currentUserEmail: TEST_USER_EMAIL,
        prevVersion: 1,
      }),
    ).rejects.toBeInstanceOf(BadRequestError);
  });

  it('should forbid deletion if version mismatch', async () => {
    const {configId} = await fixture.engine.useCases.createConfig(GLOBAL_CONTEXT, {
      name: 'version_mismatch_delete',
      value: 'test',
      schema: {type: 'string'},
      description: 'Test',
      currentUserEmail: TEST_USER_EMAIL,
      editorEmails: [],
      ownerEmails: [TEST_USER_EMAIL],
      projectId: fixture.projectId,
    });

    await expect(
      fixture.engine.useCases.deleteConfig(GLOBAL_CONTEXT, {
        configId,
        currentUserEmail: TEST_USER_EMAIL,
        prevVersion: 2, // incorrect version
      }),
    ).rejects.toBeInstanceOf(BadRequestError);
  });
});
