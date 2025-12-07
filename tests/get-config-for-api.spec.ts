import {GLOBAL_CONTEXT} from '@/engine/core/context';
import {normalizeEmail} from '@/engine/core/utils';
import {asConfigSchema, asConfigValue} from '@/engine/core/zod';
import {v4 as uuidv4} from 'uuid';
import {assert, describe, expect, it} from 'vitest';
import {useAppFixture} from './fixtures/trpc-fixture';

const CURRENT_USER_EMAIL = normalizeEmail('test@example.com');

function sleep(ms: number) {
  return new Promise(r => setTimeout(r, ms));
}

describe('Get Config For API Use Case', () => {
  const fixture = useAppFixture({authEmail: CURRENT_USER_EMAIL});

  it('should return config with name, value, overrides, and version', async () => {
    const configName = `test-config-${uuidv4()}`;

    await fixture.createConfig({
      name: configName,
      value: {feature: 'enabled'},
      schema: null,
      overrides: [
        {
          name: 'VIP Override',
          conditions: [
            {
              operator: 'equals',
              property: 'tier',
              value: {type: 'literal', value: 'vip'},
            },
          ],
          value: {feature: 'premium'},
        },
      ],
      description: 'Test config',
      currentUserEmail: CURRENT_USER_EMAIL,
      editorEmails: [],
      maintainerEmails: [CURRENT_USER_EMAIL],
      projectId: fixture.projectId,
    });

    await fixture.engine.testing.replicaService.sync(); // Wait for replica sync

    const result = await fixture.engine.useCases.getSdkConfig(GLOBAL_CONTEXT, {
      name: configName,
      projectId: fixture.projectId,
      environmentId: fixture.productionEnvironmentId,
    });

    expect(result).not.toBeNull();
    expect(result?.name).toBe(configName);
    expect(result?.value).toEqual({feature: 'enabled'});
    expect(result?.overrides).toBeDefined();
    expect(Array.isArray(result?.overrides)).toBe(true);
    expect((result?.overrides as any[]).length).toBe(1);
    expect((result?.overrides as any[])[0]?.name).toBe('VIP Override');
    expect(result?.version).toBe(1);
  });

  it('should return null for non-existent config', async () => {
    const result = await fixture.engine.useCases.getSdkConfig(GLOBAL_CONTEXT, {
      name: 'non-existent-config',
      projectId: fixture.projectId,
      environmentId: fixture.productionEnvironmentId,
    });

    expect(result).toBeNull();
  });

  it('should return updated version after patch', async () => {
    const configName = `test-config-${uuidv4()}`;

    const {configId} = await fixture.createConfig({
      name: configName,
      value: {count: 1},
      schema: null,
      overrides: [],
      description: 'Test config',
      currentUserEmail: CURRENT_USER_EMAIL,
      editorEmails: [],
      maintainerEmails: [CURRENT_USER_EMAIL],
      projectId: fixture.projectId,
    });

    await fixture.engine.testing.replicaService.sync();

    // Get the production variant
    const variants = await fixture.engine.testing.configVariants.getByConfigId(configId);
    const productionVariant = variants.find(
      v => v.environmentId === fixture.productionEnvironmentId,
    );
    const developmentVariant = variants.find(
      v => v.environmentId === fixture.developmentEnvironmentId,
    );
    assert(productionVariant, 'Production variant should exist');
    assert(developmentVariant, 'Development variant should exist');

    // Update the config (value is now {count: 2} for production)
    await fixture.engine.useCases.updateConfig(GLOBAL_CONTEXT, {
      configId,
      description: 'Test config',
      editorEmails: [],
      maintainerEmails: [CURRENT_USER_EMAIL],
      environmentVariants: [
        {
          environmentId: fixture.productionEnvironmentId,
          value: asConfigValue({count: 2}),
          schema: null,
          overrides: [],
          useDefaultSchema: true,
        },
        {
          environmentId: fixture.developmentEnvironmentId,
          value: asConfigValue({count: 1}),
          schema: null,
          overrides: [],
          useDefaultSchema: true,
        },
      ],
      defaultVariant: {
        value: asConfigValue({count: 1}),
        schema: asConfigSchema({type: 'object', properties: {count: {type: 'number'}}}),
        overrides: [],
      },
      currentUserEmail: CURRENT_USER_EMAIL,
      prevVersion: 1,
    });

    await fixture.engine.testing.replicaService.sync();

    const result = await fixture.engine.useCases.getSdkConfig(GLOBAL_CONTEXT, {
      name: configName,
      projectId: fixture.projectId,
      environmentId: fixture.productionEnvironmentId,
    });

    expect(result?.value).toEqual({count: 2});
    expect(result?.version).toBe(2);
  });

  it('should include null overrides when none are defined', async () => {
    const configName = `test-config-${uuidv4()}`;

    await fixture.createConfig({
      name: configName,
      value: 'simple-value',
      schema: null,
      overrides: [],
      description: 'Config without overrides',
      currentUserEmail: CURRENT_USER_EMAIL,
      editorEmails: [],
      maintainerEmails: [CURRENT_USER_EMAIL],
      projectId: fixture.projectId,
    });

    await fixture.engine.testing.replicaService.sync();

    const result = await fixture.engine.useCases.getSdkConfig(GLOBAL_CONTEXT, {
      name: configName,
      projectId: fixture.projectId,
      environmentId: fixture.productionEnvironmentId,
    });

    // Overrides can be null or empty array depending on how it was stored
    const hasNoOverrides =
      result?.overrides === null ||
      result?.overrides === undefined ||
      (Array.isArray(result?.overrides) && result.overrides.length === 0);
    expect(hasNoOverrides).toBe(true);
  });
});
