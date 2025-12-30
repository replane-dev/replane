import {GLOBAL_CONTEXT} from '@/engine/core/context';
import {normalizeEmail} from '@/engine/core/utils';
import {describe, expect, it} from 'vitest';
import {useAppFixture} from './fixtures/app-fixture';

const ADMIN_USER_EMAIL = normalizeEmail('admin@example.com');

describe('replica sync', () => {
  const fixture = useAppFixture({authEmail: ADMIN_USER_EMAIL});

  it('should correctly sync replica when config is deleted and recreated with same name', async () => {
    const configName = 'replica-test-config';
    const originalValue = {version: 1, message: 'original'};
    const newValue = {version: 2, message: 'updated after delete and recreate'};

    // Step 1: Create the initial config
    await fixture.createConfig({
      name: configName,
      value: originalValue,
      schema: {
        type: 'object',
        properties: {
          version: {type: 'number'},
          message: {type: 'string'},
        },
      },
      overrides: [],
      description: 'Test config for replica sync',
      identity: fixture.identity,
      editorEmails: [],
      maintainerEmails: [ADMIN_USER_EMAIL],
      projectId: fixture.projectId,
    });

    // Step 2: Sync replica and verify original value
    await fixture.syncReplica();

    const configsAfterCreate = await fixture.edge.useCases.getSdkConfigs(GLOBAL_CONTEXT, {
      projectId: fixture.projectId,
      environmentId: fixture.productionEnvironmentId,
    });

    const originalConfig = configsAfterCreate.configs.find(c => c.name === configName);
    expect(originalConfig).toBeDefined();
    expect(originalConfig?.value).toEqual(originalValue);

    // Step 3: Delete the config
    await fixture.engine.useCases.deleteConfig(GLOBAL_CONTEXT, {
      projectId: fixture.projectId,
      configName: configName,
      identity: fixture.identity,
      prevVersion: 1,
    });

    // Step 4: Immediately create a new config with the same name but different value
    await fixture.createConfig({
      name: configName,
      value: newValue,
      schema: {
        type: 'object',
        properties: {
          version: {type: 'number'},
          message: {type: 'string'},
        },
      },
      overrides: [],
      description: 'Recreated config for replica sync test',
      identity: fixture.identity,
      editorEmails: [],
      maintainerEmails: [ADMIN_USER_EMAIL],
      projectId: fixture.projectId,
    });

    // Step 5: Sync replica
    await fixture.syncReplica();

    // Step 6: Get replica config value and verify it has the new value
    const configsAfterRecreate = await fixture.edge.useCases.getSdkConfigs(GLOBAL_CONTEXT, {
      projectId: fixture.projectId,
      environmentId: fixture.productionEnvironmentId,
    });

    const recreatedConfig = configsAfterRecreate.configs.find(c => c.name === configName);
    expect(recreatedConfig).toBeDefined();
    expect(recreatedConfig?.value).toEqual(newValue);

    // Verify the value is NOT the original
    expect(recreatedConfig?.value).not.toEqual(originalValue);
  });

  it('should correctly sync replica when config is deleted and recreated with same name (no intermediate sync)', async () => {
    const configName = 'replica-no-intermediate-sync-config';
    const originalValue = 'original-value';
    const newValue = 'new-value-after-delete-recreate';

    // Step 1: Create the initial config
    await fixture.createConfig({
      name: configName,
      value: originalValue,
      schema: {type: 'string'},
      overrides: [],
      description: 'Test config for replica sync without intermediate sync',
      identity: fixture.identity,
      editorEmails: [],
      maintainerEmails: [ADMIN_USER_EMAIL],
      projectId: fixture.projectId,
    });

    // Step 2: Sync replica and verify original value
    await fixture.syncReplica();

    const configsAfterCreate = await fixture.edge.useCases.getSdkConfigs(GLOBAL_CONTEXT, {
      projectId: fixture.projectId,
      environmentId: fixture.productionEnvironmentId,
    });

    expect(configsAfterCreate.configs.find(c => c.name === configName)?.value).toBe(originalValue);

    // Step 3: Delete and immediately recreate WITHOUT syncing in between
    await fixture.engine.useCases.deleteConfig(GLOBAL_CONTEXT, {
      projectId: fixture.projectId,
      configName: configName,
      identity: fixture.identity,
      prevVersion: 1,
    });

    await fixture.createConfig({
      name: configName,
      value: newValue,
      schema: {type: 'string'},
      overrides: [],
      description: 'Recreated config',
      identity: fixture.identity,
      editorEmails: [],
      maintainerEmails: [ADMIN_USER_EMAIL],
      projectId: fixture.projectId,
    });

    // Step 4: Now sync replica (both delete and create should be processed)
    await fixture.syncReplica();

    // Step 5: Verify the new value is in replica
    const configsAfterRecreate = await fixture.edge.useCases.getSdkConfigs(GLOBAL_CONTEXT, {
      projectId: fixture.projectId,
      environmentId: fixture.productionEnvironmentId,
    });

    const recreatedConfig = configsAfterRecreate.configs.find(c => c.name === configName);
    expect(recreatedConfig).toBeDefined();
    expect(recreatedConfig?.value).toBe(newValue);
  });

  it('should handle multiple rapid delete-recreate cycles', async () => {
    const configName = 'rapid-cycle-config';

    // Create initial config
    await fixture.createConfig({
      name: configName,
      value: 'v1',
      schema: {type: 'string'},
      overrides: [],
      description: 'Rapid cycle test',
      identity: fixture.identity,
      editorEmails: [],
      maintainerEmails: [ADMIN_USER_EMAIL],
      projectId: fixture.projectId,
    });

    await fixture.syncReplica();

    // Cycle 1: delete and recreate
    await fixture.engine.useCases.deleteConfig(GLOBAL_CONTEXT, {
      projectId: fixture.projectId,
      configName: configName,
      identity: fixture.identity,
      prevVersion: 1,
    });

    await fixture.createConfig({
      name: configName,
      value: 'v2',
      schema: {type: 'string'},
      overrides: [],
      description: 'Cycle 1',
      identity: fixture.identity,
      editorEmails: [],
      maintainerEmails: [ADMIN_USER_EMAIL],
      projectId: fixture.projectId,
    });

    // Cycle 2: delete and recreate again (without syncing)
    await fixture.engine.useCases.deleteConfig(GLOBAL_CONTEXT, {
      projectId: fixture.projectId,
      configName: configName,
      identity: fixture.identity,
      prevVersion: 1,
    });

    await fixture.createConfig({
      name: configName,
      value: 'v3',
      schema: {type: 'string'},
      overrides: [],
      description: 'Cycle 2',
      identity: fixture.identity,
      editorEmails: [],
      maintainerEmails: [ADMIN_USER_EMAIL],
      projectId: fixture.projectId,
    });

    // Cycle 3: delete and recreate once more
    await fixture.engine.useCases.deleteConfig(GLOBAL_CONTEXT, {
      projectId: fixture.projectId,
      configName: configName,
      identity: fixture.identity,
      prevVersion: 1,
    });

    await fixture.createConfig({
      name: configName,
      value: 'v4-final',
      schema: {type: 'string'},
      overrides: [],
      description: 'Final cycle',
      identity: fixture.identity,
      editorEmails: [],
      maintainerEmails: [ADMIN_USER_EMAIL],
      projectId: fixture.projectId,
    });

    // Now sync replica
    await fixture.syncReplica();

    // Verify final value
    const configs = await fixture.edge.useCases.getSdkConfigs(GLOBAL_CONTEXT, {
      projectId: fixture.projectId,
      environmentId: fixture.productionEnvironmentId,
    });

    const finalConfig = configs.configs.find(c => c.name === configName);
    expect(finalConfig).toBeDefined();
    expect(finalConfig?.value).toBe('v4-final');
  });

  it('should remove config from replica when deleted', async () => {
    const configName = 'delete-from-replica-config';

    // Create config
    await fixture.createConfig({
      name: configName,
      value: 'to-be-deleted',
      schema: {type: 'string'},
      overrides: [],
      description: 'Will be deleted',
      identity: fixture.identity,
      editorEmails: [],
      maintainerEmails: [ADMIN_USER_EMAIL],
      projectId: fixture.projectId,
    });

    await fixture.syncReplica();

    // Verify it exists in replica
    const configsBefore = await fixture.edge.useCases.getSdkConfigs(GLOBAL_CONTEXT, {
      projectId: fixture.projectId,
      environmentId: fixture.productionEnvironmentId,
    });
    expect(configsBefore.configs.find(c => c.name === configName)).toBeDefined();

    // Delete config
    await fixture.engine.useCases.deleteConfig(GLOBAL_CONTEXT, {
      projectId: fixture.projectId,
      configName: configName,
      identity: fixture.identity,
      prevVersion: 1,
    });

    await fixture.syncReplica();

    // Verify it's removed from replica
    const configsAfter = await fixture.edge.useCases.getSdkConfigs(GLOBAL_CONTEXT, {
      projectId: fixture.projectId,
      environmentId: fixture.productionEnvironmentId,
    });
    expect(configsAfter.configs.find(c => c.name === configName)).toBeUndefined();
  });
});
