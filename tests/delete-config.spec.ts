import {GLOBAL_CONTEXT} from '@/engine/core/context';
import {BadRequestError, ForbiddenError} from '@/engine/core/errors';
import {normalizeEmail} from '@/engine/core/utils';
import {describe} from 'node:test';
import {expect, it} from 'vitest';
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
    });

    const {configId: keepId} = await fixture.engine.useCases.createConfig(GLOBAL_CONTEXT, {
      name: 'config_to_keep',
      value: 'keep',
      schema: {type: 'string'},
      description: 'Should remain',
      currentUserEmail: TEST_USER_EMAIL,
      editorEmails: [],
      ownerEmails: [TEST_USER_EMAIL],
    });

    // Ensure both exist
    {
      const {config} = await fixture.trpc.getConfig({name: 'config_to_delete'});
      expect(config?.config.name).toBe('config_to_delete');
    }
    {
      const {config} = await fixture.trpc.getConfig({name: 'config_to_keep'});
      expect(config?.config.name).toBe('config_to_keep');
    }

    // Delete one of them
    await fixture.engine.useCases.deleteConfig(GLOBAL_CONTEXT, {
      configId: deleteId,
      currentUserEmail: TEST_USER_EMAIL,
    });

    // Confirm deletion
    {
      const {config} = await fixture.trpc.getConfig({name: 'config_to_delete'});
      expect(config).toBeUndefined();
    }

    // Other config remains
    {
      const {config} = await fixture.trpc.getConfig({name: 'config_to_keep'});
      expect(config?.config.name).toBe('config_to_keep');
    }

    // And list reflects the single remaining config
    const {configs} = await fixture.trpc.getConfigList();
    expect(configs.map(c => c.name)).toEqual(['config_to_keep']);
  });

  it('should throw BadRequestError when config does not exist', async () => {
    await expect(
      fixture.engine.useCases.deleteConfig(GLOBAL_CONTEXT, {
        configId: '00000000-0000-0000-0000-000000000000' as any, // non-existent id
        currentUserEmail: TEST_USER_EMAIL,
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
    });

    await fixture.engine.useCases.deleteConfig(GLOBAL_CONTEXT, {
      configId,
      currentUserEmail: TEST_USER_EMAIL,
    });

    await expect(
      fixture.engine.useCases.deleteConfig(GLOBAL_CONTEXT, {
        configId,
        currentUserEmail: TEST_USER_EMAIL,
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
    });

    await expect(
      fixture.engine.useCases.deleteConfig(GLOBAL_CONTEXT, {
        configId,
        currentUserEmail: TEST_USER_EMAIL,
      }),
    ).rejects.toBeInstanceOf(ForbiddenError);

    // Still exists
    const {config} = await fixture.trpc.getConfig({name: 'cannot_delete_as_editor'});
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
    });

    await expect(
      fixture.engine.useCases.deleteConfig(GLOBAL_CONTEXT, {
        configId,
        currentUserEmail: TEST_USER_EMAIL,
      }),
    ).rejects.toBeInstanceOf(ForbiddenError);

    const {config} = await fixture.trpc.getConfig({name: 'cannot_delete_as_viewer'});
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
    });

    await fixture.engine.useCases.deleteConfig(GLOBAL_CONTEXT, {
      configId,
      currentUserEmail: TEST_USER_EMAIL,
    });

    const messages = await fixture.engine.testing.auditMessages.list({
      lte: new Date('2100-01-01T00:00:00Z'),
      limit: 10,
      orderBy: 'created_at desc, id desc',
    });
    const types = messages.map(m => (m as any).payload.type).sort();
    expect(types).toEqual(['config_created', 'config_deleted']);
    const byType: Record<string, any> = Object.fromEntries(
      messages.map(m => [(m as any).payload.type, (m as any).payload]),
    );
    expect(byType.config_created.config.name).toBe('delete_audit');
    expect(byType.config_deleted.config.name).toBe('delete_audit');
    expect(byType.config_deleted.config.value).toBe('x');
    expect(byType.config_deleted.config.version).toBe(1);
  });
});
