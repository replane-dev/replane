import {GLOBAL_CONTEXT} from '@/engine/core/context';
import type {Override} from '@/engine/core/override-condition-schemas';
import {normalizeEmail} from '@/engine/core/utils';
import {asConfigSchema, asConfigValue} from '@/engine/core/zod';
import {describe, expect, it} from 'vitest';
import {useAppFixture} from './fixtures/app-fixture';

const ADMIN_USER_EMAIL = normalizeEmail('admin@example.com');

// =============================================================================
// BASIC REPLICA SYNC TESTS
// =============================================================================

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

// =============================================================================
// CONFIG VALUE TYPES
// =============================================================================

describe('replica sync - config value types', () => {
  const fixture = useAppFixture({authEmail: ADMIN_USER_EMAIL});

  it('should sync string config values', async () => {
    await fixture.createConfig({
      name: 'string-config',
      value: 'hello world',
      schema: {type: 'string'},
      overrides: [],
      description: 'String value test',
      identity: fixture.identity,
      editorEmails: [],
      maintainerEmails: [ADMIN_USER_EMAIL],
      projectId: fixture.projectId,
    });

    await fixture.syncReplica();

    const configs = await fixture.edge.useCases.getSdkConfigs(GLOBAL_CONTEXT, {
      projectId: fixture.projectId,
      environmentId: fixture.productionEnvironmentId,
    });

    expect(configs.configs.find(c => c.name === 'string-config')?.value).toBe('hello world');
  });

  it('should sync number config values (integer)', async () => {
    await fixture.createConfig({
      name: 'integer-config',
      value: 42,
      schema: {type: 'integer'},
      overrides: [],
      description: 'Integer value test',
      identity: fixture.identity,
      editorEmails: [],
      maintainerEmails: [ADMIN_USER_EMAIL],
      projectId: fixture.projectId,
    });

    await fixture.syncReplica();

    const configs = await fixture.edge.useCases.getSdkConfigs(GLOBAL_CONTEXT, {
      projectId: fixture.projectId,
      environmentId: fixture.productionEnvironmentId,
    });

    expect(configs.configs.find(c => c.name === 'integer-config')?.value).toBe(42);
  });

  it('should sync number config values (float)', async () => {
    await fixture.createConfig({
      name: 'float-config',
      value: 3.14159,
      schema: {type: 'number'},
      overrides: [],
      description: 'Float value test',
      identity: fixture.identity,
      editorEmails: [],
      maintainerEmails: [ADMIN_USER_EMAIL],
      projectId: fixture.projectId,
    });

    await fixture.syncReplica();

    const configs = await fixture.edge.useCases.getSdkConfigs(GLOBAL_CONTEXT, {
      projectId: fixture.projectId,
      environmentId: fixture.productionEnvironmentId,
    });

    expect(configs.configs.find(c => c.name === 'float-config')?.value).toBe(3.14159);
  });

  it('should sync boolean config values', async () => {
    await fixture.createConfig({
      name: 'bool-true-config',
      value: true,
      schema: {type: 'boolean'},
      overrides: [],
      description: 'Boolean true test',
      identity: fixture.identity,
      editorEmails: [],
      maintainerEmails: [ADMIN_USER_EMAIL],
      projectId: fixture.projectId,
    });

    await fixture.createConfig({
      name: 'bool-false-config',
      value: false,
      schema: {type: 'boolean'},
      overrides: [],
      description: 'Boolean false test',
      identity: fixture.identity,
      editorEmails: [],
      maintainerEmails: [ADMIN_USER_EMAIL],
      projectId: fixture.projectId,
    });

    await fixture.syncReplica();

    const configs = await fixture.edge.useCases.getSdkConfigs(GLOBAL_CONTEXT, {
      projectId: fixture.projectId,
      environmentId: fixture.productionEnvironmentId,
    });

    expect(configs.configs.find(c => c.name === 'bool-true-config')?.value).toBe(true);
    expect(configs.configs.find(c => c.name === 'bool-false-config')?.value).toBe(false);
  });

  it('should sync null config values', async () => {
    await fixture.createConfig({
      name: 'null-config',
      value: null,
      schema: null,
      overrides: [],
      description: 'Null value test',
      identity: fixture.identity,
      editorEmails: [],
      maintainerEmails: [ADMIN_USER_EMAIL],
      projectId: fixture.projectId,
    });

    await fixture.syncReplica();

    const configs = await fixture.edge.useCases.getSdkConfigs(GLOBAL_CONTEXT, {
      projectId: fixture.projectId,
      environmentId: fixture.productionEnvironmentId,
    });

    expect(configs.configs.find(c => c.name === 'null-config')?.value).toBeNull();
  });

  it('should sync array config values', async () => {
    const arrayValue = ['item1', 'item2', 'item3'];

    await fixture.createConfig({
      name: 'array-config',
      value: arrayValue,
      schema: {type: 'array', items: {type: 'string'}},
      overrides: [],
      description: 'Array value test',
      identity: fixture.identity,
      editorEmails: [],
      maintainerEmails: [ADMIN_USER_EMAIL],
      projectId: fixture.projectId,
    });

    await fixture.syncReplica();

    const configs = await fixture.edge.useCases.getSdkConfigs(GLOBAL_CONTEXT, {
      projectId: fixture.projectId,
      environmentId: fixture.productionEnvironmentId,
    });

    expect(configs.configs.find(c => c.name === 'array-config')?.value).toEqual(arrayValue);
  });

  it('should sync object config values', async () => {
    const objectValue = {
      name: 'test',
      count: 5,
      enabled: true,
    };

    await fixture.createConfig({
      name: 'object-config',
      value: objectValue,
      schema: {
        type: 'object',
        properties: {
          name: {type: 'string'},
          count: {type: 'number'},
          enabled: {type: 'boolean'},
        },
      },
      overrides: [],
      description: 'Object value test',
      identity: fixture.identity,
      editorEmails: [],
      maintainerEmails: [ADMIN_USER_EMAIL],
      projectId: fixture.projectId,
    });

    await fixture.syncReplica();

    const configs = await fixture.edge.useCases.getSdkConfigs(GLOBAL_CONTEXT, {
      projectId: fixture.projectId,
      environmentId: fixture.productionEnvironmentId,
    });

    expect(configs.configs.find(c => c.name === 'object-config')?.value).toEqual(objectValue);
  });

  it('should sync deeply nested config values', async () => {
    const nestedValue = {
      level1: {
        level2: {
          level3: {
            level4: {
              deepValue: 'found it!',
              numbers: [1, 2, 3],
            },
          },
        },
      },
      topLevelArray: [{nested: {value: 1}}, {nested: {value: 2}}],
    };

    await fixture.createConfig({
      name: 'nested-config',
      value: nestedValue,
      schema: null,
      overrides: [],
      description: 'Deeply nested value test',
      identity: fixture.identity,
      editorEmails: [],
      maintainerEmails: [ADMIN_USER_EMAIL],
      projectId: fixture.projectId,
    });

    await fixture.syncReplica();

    const configs = await fixture.edge.useCases.getSdkConfigs(GLOBAL_CONTEXT, {
      projectId: fixture.projectId,
      environmentId: fixture.productionEnvironmentId,
    });

    expect(configs.configs.find(c => c.name === 'nested-config')?.value).toEqual(nestedValue);
  });

  it('should sync empty string config values', async () => {
    await fixture.createConfig({
      name: 'empty-string-config',
      value: '',
      schema: {type: 'string'},
      overrides: [],
      description: 'Empty string test',
      identity: fixture.identity,
      editorEmails: [],
      maintainerEmails: [ADMIN_USER_EMAIL],
      projectId: fixture.projectId,
    });

    await fixture.syncReplica();

    const configs = await fixture.edge.useCases.getSdkConfigs(GLOBAL_CONTEXT, {
      projectId: fixture.projectId,
      environmentId: fixture.productionEnvironmentId,
    });

    expect(configs.configs.find(c => c.name === 'empty-string-config')?.value).toBe('');
  });

  it('should sync empty array config values', async () => {
    await fixture.createConfig({
      name: 'empty-array-config',
      value: [],
      schema: {type: 'array', items: {type: 'string'}},
      overrides: [],
      description: 'Empty array test',
      identity: fixture.identity,
      editorEmails: [],
      maintainerEmails: [ADMIN_USER_EMAIL],
      projectId: fixture.projectId,
    });

    await fixture.syncReplica();

    const configs = await fixture.edge.useCases.getSdkConfigs(GLOBAL_CONTEXT, {
      projectId: fixture.projectId,
      environmentId: fixture.productionEnvironmentId,
    });

    expect(configs.configs.find(c => c.name === 'empty-array-config')?.value).toEqual([]);
  });

  it('should sync empty object config values', async () => {
    await fixture.createConfig({
      name: 'empty-object-config',
      value: {},
      schema: {type: 'object'},
      overrides: [],
      description: 'Empty object test',
      identity: fixture.identity,
      editorEmails: [],
      maintainerEmails: [ADMIN_USER_EMAIL],
      projectId: fixture.projectId,
    });

    await fixture.syncReplica();

    const configs = await fixture.edge.useCases.getSdkConfigs(GLOBAL_CONTEXT, {
      projectId: fixture.projectId,
      environmentId: fixture.productionEnvironmentId,
    });

    expect(configs.configs.find(c => c.name === 'empty-object-config')?.value).toEqual({});
  });

  it('should sync zero value config', async () => {
    await fixture.createConfig({
      name: 'zero-config',
      value: 0,
      schema: {type: 'number'},
      overrides: [],
      description: 'Zero value test',
      identity: fixture.identity,
      editorEmails: [],
      maintainerEmails: [ADMIN_USER_EMAIL],
      projectId: fixture.projectId,
    });

    await fixture.syncReplica();

    const configs = await fixture.edge.useCases.getSdkConfigs(GLOBAL_CONTEXT, {
      projectId: fixture.projectId,
      environmentId: fixture.productionEnvironmentId,
    });

    expect(configs.configs.find(c => c.name === 'zero-config')?.value).toBe(0);
  });

  it('should sync negative number config values', async () => {
    await fixture.createConfig({
      name: 'negative-config',
      value: -999.5,
      schema: {type: 'number'},
      overrides: [],
      description: 'Negative number test',
      identity: fixture.identity,
      editorEmails: [],
      maintainerEmails: [ADMIN_USER_EMAIL],
      projectId: fixture.projectId,
    });

    await fixture.syncReplica();

    const configs = await fixture.edge.useCases.getSdkConfigs(GLOBAL_CONTEXT, {
      projectId: fixture.projectId,
      environmentId: fixture.productionEnvironmentId,
    });

    expect(configs.configs.find(c => c.name === 'negative-config')?.value).toBe(-999.5);
  });
});

// =============================================================================
// ENVIRONMENT VARIANTS
// =============================================================================

describe('replica sync - environment variants', () => {
  const fixture = useAppFixture({authEmail: ADMIN_USER_EMAIL});

  it('should return correct value for each environment', async () => {
    const {environments} = await fixture.engine.useCases.getProjectEnvironments(GLOBAL_CONTEXT, {
      projectId: fixture.projectId,
      identity: fixture.identity,
    });

    // Create config with environment-specific values
    await fixture.engine.useCases.createConfig(GLOBAL_CONTEXT, {
      name: 'env-specific-config',
      description: 'Environment-specific config test',
      identity: fixture.identity,
      editorEmails: [],
      maintainerEmails: [ADMIN_USER_EMAIL],
      projectId: fixture.projectId,
      defaultVariant: {
        value: asConfigValue('default-value'),
        schema: asConfigSchema({type: 'string'}),
        overrides: [],
      },
      environmentVariants: environments.map(env => ({
        environmentId: env.id,
        value: asConfigValue(`value-for-${env.name.toLowerCase()}`),
        schema: asConfigSchema({type: 'string'}),
        overrides: [],
        useBaseSchema: false,
      })),
    });

    await fixture.syncReplica();

    // Check production environment
    const prodConfigs = await fixture.edge.useCases.getSdkConfigs(GLOBAL_CONTEXT, {
      projectId: fixture.projectId,
      environmentId: fixture.productionEnvironmentId,
    });
    expect(prodConfigs.configs.find(c => c.name === 'env-specific-config')?.value).toBe(
      'value-for-production',
    );

    // Check development environment
    const devConfigs = await fixture.edge.useCases.getSdkConfigs(GLOBAL_CONTEXT, {
      projectId: fixture.projectId,
      environmentId: fixture.developmentEnvironmentId,
    });
    expect(devConfigs.configs.find(c => c.name === 'env-specific-config')?.value).toBe(
      'value-for-development',
    );
  });

  it('should update environment variant independently', async () => {
    const {environments} = await fixture.engine.useCases.getProjectEnvironments(GLOBAL_CONTEXT, {
      projectId: fixture.projectId,
      identity: fixture.identity,
    });

    await fixture.engine.useCases.createConfig(GLOBAL_CONTEXT, {
      name: 'update-variant-config',
      description: 'Update variant test',
      identity: fixture.identity,
      editorEmails: [],
      maintainerEmails: [ADMIN_USER_EMAIL],
      projectId: fixture.projectId,
      defaultVariant: {
        value: asConfigValue('initial'),
        schema: asConfigSchema({type: 'string'}),
        overrides: [],
      },
      environmentVariants: environments.map(env => ({
        environmentId: env.id,
        value: asConfigValue('initial'),
        schema: asConfigSchema({type: 'string'}),
        overrides: [],
        useBaseSchema: false,
      })),
    });

    await fixture.syncReplica();

    // Update only production variant
    const {config} = await fixture.trpc.getConfig({
      name: 'update-variant-config',
      projectId: fixture.projectId,
    });

    await fixture.trpc.updateConfig({
      projectId: fixture.projectId,
      configName: 'update-variant-config',
      description: 'Update variant test',
      editorEmails: [],
      maintainerEmails: [],
      prevVersion: config!.config.version,
      defaultVariant: {
        value: asConfigValue('initial'),
        schema: asConfigSchema({type: 'string'}),
        overrides: [],
      },
      environmentVariants: environments.map(env => ({
        environmentId: env.id,
        value: asConfigValue(
          env.id === fixture.productionEnvironmentId ? 'updated-prod' : 'initial',
        ),
        schema: null,
        overrides: [],
        useBaseSchema: true,
      })),
    });

    await fixture.syncReplica();

    // Check production environment (updated)
    const prodConfigs = await fixture.edge.useCases.getSdkConfigs(GLOBAL_CONTEXT, {
      projectId: fixture.projectId,
      environmentId: fixture.productionEnvironmentId,
    });
    expect(prodConfigs.configs.find(c => c.name === 'update-variant-config')?.value).toBe(
      'updated-prod',
    );

    // Check development environment (unchanged)
    const devConfigs = await fixture.edge.useCases.getSdkConfigs(GLOBAL_CONTEXT, {
      projectId: fixture.projectId,
      environmentId: fixture.developmentEnvironmentId,
    });
    expect(devConfigs.configs.find(c => c.name === 'update-variant-config')?.value).toBe('initial');
  });
});

// =============================================================================
// CONFIG VERSION TRACKING
// =============================================================================

describe('replica sync - version tracking', () => {
  const fixture = useAppFixture({authEmail: ADMIN_USER_EMAIL});

  it('should track version increments on updates', async () => {
    await fixture.createConfig({
      name: 'version-track-config',
      value: 'v1',
      schema: {type: 'string'},
      overrides: [],
      description: 'Version tracking test',
      identity: fixture.identity,
      editorEmails: [],
      maintainerEmails: [ADMIN_USER_EMAIL],
      projectId: fixture.projectId,
    });

    await fixture.syncReplica();

    const {environments} = await fixture.engine.useCases.getProjectEnvironments(GLOBAL_CONTEXT, {
      projectId: fixture.projectId,
      identity: fixture.identity,
    });

    // Get config and update it multiple times
    for (let i = 2; i <= 5; i++) {
      const {config} = await fixture.trpc.getConfig({
        name: 'version-track-config',
        projectId: fixture.projectId,
      });

      await fixture.trpc.updateConfig({
        projectId: fixture.projectId,
        configName: 'version-track-config',
        description: 'Version tracking test',
        editorEmails: [],
        maintainerEmails: [],
        prevVersion: config!.config.version,
        defaultVariant: {
          value: asConfigValue(`v${i}`),
          schema: asConfigSchema({type: 'string'}),
          overrides: [],
        },
        environmentVariants: environments.map(env => ({
          environmentId: env.id,
          value: asConfigValue(`v${i}`),
          schema: null,
          overrides: [],
          useBaseSchema: true,
        })),
      });

      await fixture.syncReplica();

      const configs = await fixture.edge.useCases.getSdkConfigs(GLOBAL_CONTEXT, {
        projectId: fixture.projectId,
        environmentId: fixture.productionEnvironmentId,
      });

      expect(configs.configs.find(c => c.name === 'version-track-config')?.value).toBe(`v${i}`);
    }
  });
});

// =============================================================================
// SDK KEY SYNC
// =============================================================================

describe('replica sync - SDK keys', () => {
  const fixture = useAppFixture({authEmail: ADMIN_USER_EMAIL});

  it('should sync SDK key creation', async () => {
    const {sdkKey} = await fixture.engine.useCases.createSdkKey(GLOBAL_CONTEXT, {
      identity: fixture.identity,
      projectId: fixture.projectId,
      environmentId: fixture.productionEnvironmentId,
      name: 'test-sdk-key',
      description: 'Test SDK key',
    });

    await fixture.syncReplica();

    const replicaSdkKey = await fixture.edge.testing.replicaService.getSdkKeyById(sdkKey.id);
    expect(replicaSdkKey).toBeDefined();
    expect(replicaSdkKey?.name).toBe('test-sdk-key');
    expect(replicaSdkKey?.projectId).toBe(fixture.projectId);
    expect(replicaSdkKey?.environmentId).toBe(fixture.productionEnvironmentId);
  });

  it('should sync SDK key deletion', async () => {
    const {sdkKey} = await fixture.engine.useCases.createSdkKey(GLOBAL_CONTEXT, {
      identity: fixture.identity,
      projectId: fixture.projectId,
      environmentId: fixture.productionEnvironmentId,
      name: 'key-to-delete',
      description: 'Key to be deleted',
    });

    await fixture.syncReplica();

    // Verify it exists
    let replicaSdkKey = await fixture.edge.testing.replicaService.getSdkKeyById(sdkKey.id);
    expect(replicaSdkKey).toBeDefined();

    // Delete it
    await fixture.engine.useCases.deleteSdkKey(GLOBAL_CONTEXT, {
      identity: fixture.identity,
      projectId: fixture.projectId,
      id: sdkKey.id,
    });

    await fixture.syncReplica();

    // Verify it's removed
    replicaSdkKey = await fixture.edge.testing.replicaService.getSdkKeyById(sdkKey.id);
    expect(replicaSdkKey).toBeUndefined();
  });

  it('should sync multiple SDK keys', async () => {
    const keys = [];
    for (let i = 0; i < 5; i++) {
      const {sdkKey} = await fixture.engine.useCases.createSdkKey(GLOBAL_CONTEXT, {
        identity: fixture.identity,
        projectId: fixture.projectId,
        environmentId: fixture.productionEnvironmentId,
        name: `multi-key-${i}`,
        description: `Multi key ${i}`,
      });
      keys.push(sdkKey);
    }

    await fixture.syncReplica();

    for (const key of keys) {
      const replicaSdkKey = await fixture.edge.testing.replicaService.getSdkKeyById(key.id);
      expect(replicaSdkKey).toBeDefined();
    }
  });

  it('should sync SDK keys for different environments', async () => {
    const {sdkKey: prodKey} = await fixture.engine.useCases.createSdkKey(GLOBAL_CONTEXT, {
      identity: fixture.identity,
      projectId: fixture.projectId,
      environmentId: fixture.productionEnvironmentId,
      name: 'prod-key',
      description: 'Production key',
    });

    const {sdkKey: devKey} = await fixture.engine.useCases.createSdkKey(GLOBAL_CONTEXT, {
      identity: fixture.identity,
      projectId: fixture.projectId,
      environmentId: fixture.developmentEnvironmentId,
      name: 'dev-key',
      description: 'Development key',
    });

    await fixture.syncReplica();

    const replicaProdKey = await fixture.edge.testing.replicaService.getSdkKeyById(prodKey.id);
    const replicaDevKey = await fixture.edge.testing.replicaService.getSdkKeyById(devKey.id);

    expect(replicaProdKey?.environmentId).toBe(fixture.productionEnvironmentId);
    expect(replicaDevKey?.environmentId).toBe(fixture.developmentEnvironmentId);
  });
});

// =============================================================================
// MULTI-PROJECT ISOLATION
// =============================================================================

describe('replica sync - multi-project isolation', () => {
  const fixture = useAppFixture({authEmail: ADMIN_USER_EMAIL});

  it('should isolate configs between projects', async () => {
    // Create a second project
    const {projectId: secondProjectId, environments} = await fixture.engine.useCases.createProject(
      GLOBAL_CONTEXT,
      {
        identity: fixture.identity,
        workspaceId: fixture.workspaceId,
        name: 'Second Project',
        description: 'Second project for isolation test',
      },
    );

    const secondProdEnvId = environments.find(e => e.name === 'Production')!.id;

    // Create config in first project
    await fixture.createConfig({
      name: 'shared-name-config',
      value: 'project-1-value',
      schema: {type: 'string'},
      overrides: [],
      description: 'Project 1 config',
      identity: fixture.identity,
      editorEmails: [],
      maintainerEmails: [ADMIN_USER_EMAIL],
      projectId: fixture.projectId,
    });

    // Create config with same name in second project
    await fixture.createConfig({
      name: 'shared-name-config',
      value: 'project-2-value',
      schema: {type: 'string'},
      overrides: [],
      description: 'Project 2 config',
      identity: fixture.identity,
      editorEmails: [],
      maintainerEmails: [ADMIN_USER_EMAIL],
      projectId: secondProjectId,
    });

    await fixture.syncReplica();

    // Get configs from first project
    const project1Configs = await fixture.edge.useCases.getSdkConfigs(GLOBAL_CONTEXT, {
      projectId: fixture.projectId,
      environmentId: fixture.productionEnvironmentId,
    });

    // Get configs from second project
    const project2Configs = await fixture.edge.useCases.getSdkConfigs(GLOBAL_CONTEXT, {
      projectId: secondProjectId,
      environmentId: secondProdEnvId,
    });

    expect(project1Configs.configs.find(c => c.name === 'shared-name-config')?.value).toBe(
      'project-1-value',
    );
    expect(project2Configs.configs.find(c => c.name === 'shared-name-config')?.value).toBe(
      'project-2-value',
    );
  });

  it('should not affect other projects when deleting config', async () => {
    // Create a second project
    const {projectId: secondProjectId, environments} = await fixture.engine.useCases.createProject(
      GLOBAL_CONTEXT,
      {
        identity: fixture.identity,
        workspaceId: fixture.workspaceId,
        name: 'Second Project',
        description: 'Second project for delete isolation test',
      },
    );

    const secondProdEnvId = environments.find(e => e.name === 'Production')!.id;

    // Create config in both projects
    await fixture.createConfig({
      name: 'delete-isolation-config',
      value: 'project-1',
      schema: {type: 'string'},
      overrides: [],
      description: 'Project 1',
      identity: fixture.identity,
      editorEmails: [],
      maintainerEmails: [ADMIN_USER_EMAIL],
      projectId: fixture.projectId,
    });

    await fixture.createConfig({
      name: 'delete-isolation-config',
      value: 'project-2',
      schema: {type: 'string'},
      overrides: [],
      description: 'Project 2',
      identity: fixture.identity,
      editorEmails: [],
      maintainerEmails: [ADMIN_USER_EMAIL],
      projectId: secondProjectId,
    });

    await fixture.syncReplica();

    // Delete from first project
    await fixture.engine.useCases.deleteConfig(GLOBAL_CONTEXT, {
      projectId: fixture.projectId,
      configName: 'delete-isolation-config',
      identity: fixture.identity,
      prevVersion: 1,
    });

    await fixture.syncReplica();

    // Verify deleted from first project
    const project1Configs = await fixture.edge.useCases.getSdkConfigs(GLOBAL_CONTEXT, {
      projectId: fixture.projectId,
      environmentId: fixture.productionEnvironmentId,
    });
    expect(project1Configs.configs.find(c => c.name === 'delete-isolation-config')).toBeUndefined();

    // Verify still exists in second project
    const project2Configs = await fixture.edge.useCases.getSdkConfigs(GLOBAL_CONTEXT, {
      projectId: secondProjectId,
      environmentId: secondProdEnvId,
    });
    expect(project2Configs.configs.find(c => c.name === 'delete-isolation-config')?.value).toBe(
      'project-2',
    );
  });
});

// =============================================================================
// SPECIAL CHARACTERS AND EDGE CASES
// =============================================================================

describe('replica sync - special characters and edge cases', () => {
  const fixture = useAppFixture({authEmail: ADMIN_USER_EMAIL});

  it('should sync config with special characters in name', async () => {
    await fixture.createConfig({
      name: 'config-with-dashes',
      value: 'dashes',
      schema: {type: 'string'},
      overrides: [],
      description: 'Dashes in name',
      identity: fixture.identity,
      editorEmails: [],
      maintainerEmails: [ADMIN_USER_EMAIL],
      projectId: fixture.projectId,
    });

    await fixture.createConfig({
      name: 'config_with_underscores',
      value: 'underscores',
      schema: {type: 'string'},
      overrides: [],
      description: 'Underscores in name',
      identity: fixture.identity,
      editorEmails: [],
      maintainerEmails: [ADMIN_USER_EMAIL],
      projectId: fixture.projectId,
    });

    await fixture.syncReplica();

    const configs = await fixture.edge.useCases.getSdkConfigs(GLOBAL_CONTEXT, {
      projectId: fixture.projectId,
      environmentId: fixture.productionEnvironmentId,
    });

    expect(configs.configs.find(c => c.name === 'config-with-dashes')?.value).toBe('dashes');
    expect(configs.configs.find(c => c.name === 'config_with_underscores')?.value).toBe(
      'underscores',
    );
  });

  it('should sync config with unicode in value', async () => {
    const unicodeValue = {
      japanese: '日本語',
      emoji: '🚀🎉🔥',
      mixed: 'Hello 世界 مرحبا',
      russian: 'Привет мир',
    };

    await fixture.createConfig({
      name: 'unicode-config',
      value: unicodeValue,
      schema: null,
      overrides: [],
      description: 'Unicode value test',
      identity: fixture.identity,
      editorEmails: [],
      maintainerEmails: [ADMIN_USER_EMAIL],
      projectId: fixture.projectId,
    });

    await fixture.syncReplica();

    const configs = await fixture.edge.useCases.getSdkConfigs(GLOBAL_CONTEXT, {
      projectId: fixture.projectId,
      environmentId: fixture.productionEnvironmentId,
    });

    expect(configs.configs.find(c => c.name === 'unicode-config')?.value).toEqual(unicodeValue);
  });

  it('should sync config with very long string value', async () => {
    const longValue = 'x'.repeat(100000); // 100KB string

    await fixture.createConfig({
      name: 'long-string-config',
      value: longValue,
      schema: {type: 'string'},
      overrides: [],
      description: 'Long string test',
      identity: fixture.identity,
      editorEmails: [],
      maintainerEmails: [ADMIN_USER_EMAIL],
      projectId: fixture.projectId,
    });

    await fixture.syncReplica();

    const configs = await fixture.edge.useCases.getSdkConfigs(GLOBAL_CONTEXT, {
      projectId: fixture.projectId,
      environmentId: fixture.productionEnvironmentId,
    });

    expect(configs.configs.find(c => c.name === 'long-string-config')?.value).toBe(longValue);
  });

  it('should sync config with JSON-like string value (not parsed)', async () => {
    const jsonLikeString = '{"this": "is a string, not JSON"}';

    await fixture.createConfig({
      name: 'json-like-string-config',
      value: jsonLikeString,
      schema: {type: 'string'},
      overrides: [],
      description: 'JSON-like string test',
      identity: fixture.identity,
      editorEmails: [],
      maintainerEmails: [ADMIN_USER_EMAIL],
      projectId: fixture.projectId,
    });

    await fixture.syncReplica();

    const configs = await fixture.edge.useCases.getSdkConfigs(GLOBAL_CONTEXT, {
      projectId: fixture.projectId,
      environmentId: fixture.productionEnvironmentId,
    });

    // Should be a string, not parsed as JSON
    expect(configs.configs.find(c => c.name === 'json-like-string-config')?.value).toBe(
      jsonLikeString,
    );
    expect(typeof configs.configs.find(c => c.name === 'json-like-string-config')?.value).toBe(
      'string',
    );
  });

  it('should sync config with large number values', async () => {
    await fixture.createConfig({
      name: 'large-number-config',
      value: Number.MAX_SAFE_INTEGER,
      schema: {type: 'integer'},
      overrides: [],
      description: 'Large number test',
      identity: fixture.identity,
      editorEmails: [],
      maintainerEmails: [ADMIN_USER_EMAIL],
      projectId: fixture.projectId,
    });

    await fixture.syncReplica();

    const configs = await fixture.edge.useCases.getSdkConfigs(GLOBAL_CONTEXT, {
      projectId: fixture.projectId,
      environmentId: fixture.productionEnvironmentId,
    });

    expect(configs.configs.find(c => c.name === 'large-number-config')?.value).toBe(
      Number.MAX_SAFE_INTEGER,
    );
  });
});

// =============================================================================
// MULTIPLE CONFIGS
// =============================================================================

describe('replica sync - multiple configs', () => {
  const fixture = useAppFixture({authEmail: ADMIN_USER_EMAIL});

  it('should sync many configs at once', async () => {
    const configCount = 50;

    for (let i = 0; i < configCount; i++) {
      await fixture.createConfig({
        name: `batch-config-${i.toString().padStart(3, '0')}`,
        value: i,
        schema: {type: 'number'},
        overrides: [],
        description: `Batch config ${i}`,
        identity: fixture.identity,
        editorEmails: [],
        maintainerEmails: [ADMIN_USER_EMAIL],
        projectId: fixture.projectId,
      });
    }

    await fixture.syncReplica();

    const configs = await fixture.edge.useCases.getSdkConfigs(GLOBAL_CONTEXT, {
      projectId: fixture.projectId,
      environmentId: fixture.productionEnvironmentId,
    });

    const batchConfigs = configs.configs.filter(c => c.name.startsWith('batch-config-'));
    expect(batchConfigs.length).toBe(configCount);

    for (let i = 0; i < configCount; i++) {
      const config = configs.configs.find(
        c => c.name === `batch-config-${i.toString().padStart(3, '0')}`,
      );
      expect(config?.value).toBe(i);
    }
  });

  it('should handle empty project (no configs)', async () => {
    // Don't create any configs
    await fixture.syncReplica();

    const configs = await fixture.edge.useCases.getSdkConfigs(GLOBAL_CONTEXT, {
      projectId: fixture.projectId,
      environmentId: fixture.productionEnvironmentId,
    });

    expect(configs.configs).toEqual([]);
  });
});

// =============================================================================
// CONFIG WITH OVERRIDES
// =============================================================================

describe('replica sync - configs with overrides', () => {
  const fixture = useAppFixture({authEmail: ADMIN_USER_EMAIL});

  it('should sync config with simple override', async () => {
    const overrides: Override[] = [
      {
        name: 'Admin Override',
        conditions: [
          {
            operator: 'equals',
            property: 'userId',
            value: {type: 'literal', value: asConfigValue('admin-user')},
          },
        ],
        value: asConfigValue('admin-value'),
      },
    ];

    const {environments} = await fixture.engine.useCases.getProjectEnvironments(GLOBAL_CONTEXT, {
      projectId: fixture.projectId,
      identity: fixture.identity,
    });

    await fixture.engine.useCases.createConfig(GLOBAL_CONTEXT, {
      name: 'override-config',
      description: 'Config with overrides',
      identity: fixture.identity,
      editorEmails: [],
      maintainerEmails: [ADMIN_USER_EMAIL],
      projectId: fixture.projectId,
      defaultVariant: {
        value: asConfigValue('default-value'),
        schema: asConfigSchema({type: 'string'}),
        overrides: overrides,
      },
      environmentVariants: environments.map(env => ({
        environmentId: env.id,
        value: asConfigValue('default-value'),
        schema: asConfigSchema({type: 'string'}),
        overrides: overrides,
        useBaseSchema: false,
      })),
    });

    await fixture.syncReplica();

    const configs = await fixture.edge.useCases.getSdkConfigs(GLOBAL_CONTEXT, {
      projectId: fixture.projectId,
      environmentId: fixture.productionEnvironmentId,
    });

    const config = configs.configs.find(c => c.name === 'override-config');
    expect(config?.value).toBe('default-value');
    expect(config?.overrides.length).toBe(1);
    expect(config?.overrides[0].value).toBe('admin-value');
  });

  it('should sync config with multiple overrides', async () => {
    const overrides: Override[] = [
      {
        name: 'Premium Tier',
        conditions: [
          {
            operator: 'equals',
            property: 'tier',
            value: {type: 'literal', value: asConfigValue('premium')},
          },
        ],
        value: asConfigValue(100),
      },
      {
        name: 'Basic Tier',
        conditions: [
          {
            operator: 'equals',
            property: 'tier',
            value: {type: 'literal', value: asConfigValue('basic')},
          },
        ],
        value: asConfigValue(10),
      },
      {
        name: 'Disabled Tier',
        conditions: [
          {
            operator: 'equals',
            property: 'tier',
            value: {type: 'literal', value: asConfigValue('disabled')},
          },
        ],
        value: asConfigValue(0),
      },
    ];

    const {environments} = await fixture.engine.useCases.getProjectEnvironments(GLOBAL_CONTEXT, {
      projectId: fixture.projectId,
      identity: fixture.identity,
    });

    await fixture.engine.useCases.createConfig(GLOBAL_CONTEXT, {
      name: 'multi-override-config',
      description: 'Config with multiple overrides',
      identity: fixture.identity,
      editorEmails: [],
      maintainerEmails: [ADMIN_USER_EMAIL],
      projectId: fixture.projectId,
      defaultVariant: {
        value: asConfigValue(5),
        schema: asConfigSchema({type: 'number'}),
        overrides: overrides,
      },
      environmentVariants: environments.map(env => ({
        environmentId: env.id,
        value: asConfigValue(5),
        schema: asConfigSchema({type: 'number'}),
        overrides: overrides,
        useBaseSchema: false,
      })),
    });

    await fixture.syncReplica();

    const configs = await fixture.edge.useCases.getSdkConfigs(GLOBAL_CONTEXT, {
      projectId: fixture.projectId,
      environmentId: fixture.productionEnvironmentId,
    });

    const config = configs.configs.find(c => c.name === 'multi-override-config');
    expect(config?.value).toBe(5);
    expect(config?.overrides.length).toBe(3);
  });
});

// =============================================================================
// REPLICA STATUS
// =============================================================================

describe('replica sync - status', () => {
  const fixture = useAppFixture({authEmail: ADMIN_USER_EMAIL});

  it('should report up-to-date after sync', async () => {
    await fixture.createConfig({
      name: 'status-test-config',
      value: 'test',
      schema: {type: 'string'},
      overrides: [],
      description: 'Status test',
      identity: fixture.identity,
      editorEmails: [],
      maintainerEmails: [ADMIN_USER_EMAIL],
      projectId: fixture.projectId,
    });

    await fixture.syncReplica();

    const status = await fixture.edge.testing.replicaService.status();
    expect(status).toBe('up-to-date');
  });
});
