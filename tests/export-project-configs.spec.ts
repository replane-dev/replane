import {GLOBAL_CONTEXT} from '@/engine/core/context';
import {normalizeEmail} from '@/engine/core/utils';
import {asConfigValue} from '@/engine/core/zod';
import {describe, expect, it} from 'vitest';
import {useAppFixture} from './fixtures/app-fixture';

const ADMIN_USER_EMAIL = normalizeEmail('admin@example.com');

describe('exportProjectConfigs', () => {
  const fixture = useAppFixture({authEmail: ADMIN_USER_EMAIL});

  it('should export an empty array when no configs exist', async () => {
    const result = await fixture.engine.useCases.exportProjectConfigs(GLOBAL_CONTEXT, {
      identity: fixture.identity,
      projectId: fixture.projectId,
    });

    expect(result.projectName).toBe('Test Project');
    expect(result.configs).toEqual([]);
    expect(result.exportedAt).toBeDefined();
    expect(new Date(result.exportedAt).getTime()).not.toBeNaN();
  });

  it('should export a single config with all fields', async () => {
    await fixture.createConfig({
      name: 'test-config',
      value: {enabled: true, count: 5},
      schema: {
        type: 'object',
        properties: {
          enabled: {type: 'boolean'},
          count: {type: 'number'},
        },
      },
      overrides: [],
      description: 'A test config for export',
      identity: fixture.identity,
      editorEmails: [],
      maintainerEmails: [],
      projectId: fixture.projectId,
    });

    const result = await fixture.engine.useCases.exportProjectConfigs(GLOBAL_CONTEXT, {
      identity: fixture.identity,
      projectId: fixture.projectId,
    });

    expect(result.configs).toHaveLength(1);
    const config = result.configs[0];
    expect(config.name).toBe('test-config');
    expect(config.description).toBe('A test config for export');
    expect(config.value).toEqual({enabled: true, count: 5});
    expect(config.schema).toEqual({
      type: 'object',
      properties: {
        enabled: {type: 'boolean'},
        count: {type: 'number'},
      },
    });
    expect(config.overrides).toEqual([]);
  });

  it('should export multiple configs sorted by name', async () => {
    await fixture.createConfig({
      name: 'zebra-config',
      value: 'z',
      schema: null,
      overrides: [],
      description: 'Last alphabetically',
      identity: fixture.identity,
      editorEmails: [],
      maintainerEmails: [],
      projectId: fixture.projectId,
    });

    await fixture.createConfig({
      name: 'alpha-config',
      value: 'a',
      schema: null,
      overrides: [],
      description: 'First alphabetically',
      identity: fixture.identity,
      editorEmails: [],
      maintainerEmails: [],
      projectId: fixture.projectId,
    });

    await fixture.createConfig({
      name: 'beta-config',
      value: 'b',
      schema: null,
      overrides: [],
      description: 'Middle',
      identity: fixture.identity,
      editorEmails: [],
      maintainerEmails: [],
      projectId: fixture.projectId,
    });

    const result = await fixture.engine.useCases.exportProjectConfigs(GLOBAL_CONTEXT, {
      identity: fixture.identity,
      projectId: fixture.projectId,
    });

    expect(result.configs).toHaveLength(3);
    expect(result.configs[0].name).toBe('alpha-config');
    expect(result.configs[1].name).toBe('beta-config');
    expect(result.configs[2].name).toBe('zebra-config');
  });

  it('should export config with environment variants', async () => {
    await fixture.createConfig({
      name: 'env-config',
      value: {env: 'default'},
      schema: null,
      overrides: [],
      description: 'Config with env variants',
      identity: fixture.identity,
      editorEmails: [],
      maintainerEmails: [],
      projectId: fixture.projectId,
    });

    const result = await fixture.engine.useCases.exportProjectConfigs(GLOBAL_CONTEXT, {
      identity: fixture.identity,
      projectId: fixture.projectId,
    });

    expect(result.configs).toHaveLength(1);
    const config = result.configs[0];
    expect(config.variants).toHaveLength(2); // Production and Development

    const productionVariant = config.variants.find(v => v.environmentName === 'Production');
    const developmentVariant = config.variants.find(v => v.environmentName === 'Development');

    expect(productionVariant).toBeDefined();
    expect(developmentVariant).toBeDefined();
    expect(productionVariant?.value).toEqual({env: 'default'});
    expect(developmentVariant?.value).toEqual({env: 'default'});
  });

  it('should export config with different values per environment', async () => {
    // Create config with different values per environment
    const {environments} = await fixture.engine.useCases.getProjectEnvironments(GLOBAL_CONTEXT, {
      projectId: fixture.projectId,
      identity: fixture.identity,
    });

    const productionEnvId = environments.find(e => e.name === 'Production')?.id;
    const developmentEnvId = environments.find(e => e.name === 'Development')?.id;

    await fixture.engine.useCases.createConfig(GLOBAL_CONTEXT, {
      name: 'multi-env-config',
      description: 'Different values per environment',
      identity: fixture.identity,
      editorEmails: [],
      maintainerEmails: [],
      projectId: fixture.projectId,
      defaultVariant: {
        value: asConfigValue('default-value'),
        schema: null,
        overrides: [],
      },
      environmentVariants: [
        {
          environmentId: productionEnvId!,
          value: asConfigValue('production-value'),
          schema: null,
          overrides: [],
          useBaseSchema: false,
        },
        {
          environmentId: developmentEnvId!,
          value: asConfigValue('development-value'),
          schema: null,
          overrides: [],
          useBaseSchema: false,
        },
      ],
    });

    const result = await fixture.engine.useCases.exportProjectConfigs(GLOBAL_CONTEXT, {
      identity: fixture.identity,
      projectId: fixture.projectId,
    });

    const config = result.configs.find(c => c.name === 'multi-env-config');
    expect(config).toBeDefined();

    const productionVariant = config?.variants.find(v => v.environmentName === 'Production');
    const developmentVariant = config?.variants.find(v => v.environmentName === 'Development');

    expect(productionVariant?.value).toBe('production-value');
    expect(developmentVariant?.value).toBe('development-value');
  });

  it('should export config with null schema', async () => {
    await fixture.createConfig({
      name: 'no-schema-config',
      value: 'any-value',
      schema: null,
      overrides: [],
      description: 'Config without schema',
      identity: fixture.identity,
      editorEmails: [],
      maintainerEmails: [],
      projectId: fixture.projectId,
    });

    const result = await fixture.engine.useCases.exportProjectConfigs(GLOBAL_CONTEXT, {
      identity: fixture.identity,
      projectId: fixture.projectId,
    });

    const config = result.configs[0];
    expect(config.schema).toBeNull();
  });

  it('should export config with complex nested value', async () => {
    const complexValue = {
      level1: {
        level2: {
          items: [1, 2, 3],
          flag: true,
        },
      },
      array: ['a', 'b', 'c'],
    };

    await fixture.createConfig({
      name: 'complex-config',
      value: complexValue,
      schema: null,
      overrides: [],
      description: 'Complex nested config',
      identity: fixture.identity,
      editorEmails: [],
      maintainerEmails: [],
      projectId: fixture.projectId,
    });

    const result = await fixture.engine.useCases.exportProjectConfigs(GLOBAL_CONTEXT, {
      identity: fixture.identity,
      projectId: fixture.projectId,
    });

    expect(result.configs[0].value).toEqual(complexValue);
  });

  it('should export config with overrides', async () => {
    await fixture.createConfig({
      name: 'override-config',
      value: 'default',
      schema: null,
      overrides: [
        {
          name: 'premium-users',
          conditions: [{field: 'userTier', operator: 'equals', value: 'premium'}],
          value: 'premium-value',
        },
      ],
      description: 'Config with overrides',
      identity: fixture.identity,
      editorEmails: [],
      maintainerEmails: [],
      projectId: fixture.projectId,
    });

    const result = await fixture.engine.useCases.exportProjectConfigs(GLOBAL_CONTEXT, {
      identity: fixture.identity,
      projectId: fixture.projectId,
    });

    expect(result.configs[0].overrides).toHaveLength(1);
    expect(result.configs[0].overrides[0].name).toBe('premium-users');
  });

  it('should include project name in export', async () => {
    const result = await fixture.engine.useCases.exportProjectConfigs(GLOBAL_CONTEXT, {
      identity: fixture.identity,
      projectId: fixture.projectId,
    });

    expect(result.projectName).toBe('Test Project');
  });

  it('should include export timestamp', async () => {
    const beforeExport = new Date();

    const result = await fixture.engine.useCases.exportProjectConfigs(GLOBAL_CONTEXT, {
      identity: fixture.identity,
      projectId: fixture.projectId,
    });

    const exportDate = new Date(result.exportedAt);
    expect(exportDate.getTime()).toBeGreaterThanOrEqual(beforeExport.getTime() - 1000);
  });

  it('should throw error when project not found', async () => {
    await expect(
      fixture.engine.useCases.exportProjectConfigs(GLOBAL_CONTEXT, {
        identity: fixture.identity,
        projectId: '00000000-0000-0000-0000-000000000000',
      }),
    ).rejects.toThrow();
  });
});

