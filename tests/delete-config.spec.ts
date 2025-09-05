import {GLOBAL_CONTEXT} from '@/engine/core/context';
import {BadRequestError} from '@/engine/core/errors';
import {normalizeEmail} from '@/engine/core/utils';
import {describe} from 'node:test';
import {expect, it} from 'vitest';
import {useAppFixture} from './fixtures/trpc-fixture';

const TEST_USER_EMAIL = normalizeEmail('test@example.com');

describe('deleteConfig', () => {
  const fixture = useAppFixture({authEmail: TEST_USER_EMAIL});

  it('should delete an existing config', async () => {
    // Create two configs
    await fixture.engine.useCases.createConfig(GLOBAL_CONTEXT, {
      name: 'config_to_delete',
      value: {enabled: true},
      schema: {type: 'object', properties: {enabled: {type: 'boolean'}}},
      description: 'To be deleted',
      currentUserEmail: TEST_USER_EMAIL,
      editorEmails: [],
      ownerEmails: [TEST_USER_EMAIL],
    });

    await fixture.engine.useCases.createConfig(GLOBAL_CONTEXT, {
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
      name: 'config_to_delete',
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
        name: 'missing_config',
        currentUserEmail: TEST_USER_EMAIL,
      }),
    ).rejects.toBeInstanceOf(BadRequestError);
  });

  it('should throw BadRequestError on double delete', async () => {
    await fixture.engine.useCases.createConfig(GLOBAL_CONTEXT, {
      name: 'double_delete',
      value: 1,
      schema: {type: 'number'},
      description: 'double delete case',
      currentUserEmail: TEST_USER_EMAIL,
      editorEmails: [],
      ownerEmails: [TEST_USER_EMAIL],
    });

    await fixture.engine.useCases.deleteConfig(GLOBAL_CONTEXT, {
      name: 'double_delete',
      currentUserEmail: TEST_USER_EMAIL,
    });

    await expect(
      fixture.engine.useCases.deleteConfig(GLOBAL_CONTEXT, {
        name: 'double_delete',
        currentUserEmail: TEST_USER_EMAIL,
      }),
    ).rejects.toBeInstanceOf(BadRequestError);
  });
});
