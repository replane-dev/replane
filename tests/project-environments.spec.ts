import {GLOBAL_CONTEXT} from '@/engine/core/context';
import {BadRequestError} from '@/engine/core/errors';
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

describe('createProjectEnvironment', () => {
  const fixture = useAppFixture({authEmail: ADMIN_USER_EMAIL});

  it('should create a new environment', async () => {
    const {environmentId} = await fixture.engine.useCases.createProjectEnvironment(GLOBAL_CONTEXT, {
      identity: fixture.identity,
      projectId: fixture.projectId,
      name: 'Staging',
      copyFromEnvironmentId: fixture.productionEnvironmentId,
    });

    expect(environmentId).toBeDefined();

    const {environments} = await fixture.engine.useCases.getProjectEnvironments(GLOBAL_CONTEXT, {
      identity: fixture.identity,
      projectId: fixture.projectId,
    });

    const staging = environments.find(e => e.name === 'Staging');
    expect(staging).toBeDefined();
    expect(staging?.id).toBe(environmentId);
  });

  it('should throw error when environment name already exists', async () => {
    // Production already exists
    await expect(
      fixture.engine.useCases.createProjectEnvironment(GLOBAL_CONTEXT, {
        identity: fixture.identity,
        projectId: fixture.projectId,
        name: 'Production',
        copyFromEnvironmentId: fixture.developmentEnvironmentId,
      }),
    ).rejects.toThrow(BadRequestError);

    await expect(
      fixture.engine.useCases.createProjectEnvironment(GLOBAL_CONTEXT, {
        identity: fixture.identity,
        projectId: fixture.projectId,
        name: 'Production',
        copyFromEnvironmentId: fixture.developmentEnvironmentId,
      }),
    ).rejects.toThrow('Environment with this name already exists');
  });

  it('should throw error when environment name conflicts case-insensitively', async () => {
    await expect(
      fixture.engine.useCases.createProjectEnvironment(GLOBAL_CONTEXT, {
        identity: fixture.identity,
        projectId: fixture.projectId,
        name: 'PRODUCTION',
        copyFromEnvironmentId: fixture.developmentEnvironmentId,
      }),
    ).rejects.toThrow('Environment with this name already exists');

    await expect(
      fixture.engine.useCases.createProjectEnvironment(GLOBAL_CONTEXT, {
        identity: fixture.identity,
        projectId: fixture.projectId,
        name: 'production',
        copyFromEnvironmentId: fixture.developmentEnvironmentId,
      }),
    ).rejects.toThrow('Environment with this name already exists');
  });

  it('should throw error when environment name is invalid', async () => {
    await expect(
      fixture.engine.useCases.createProjectEnvironment(GLOBAL_CONTEXT, {
        identity: fixture.identity,
        projectId: fixture.projectId,
        name: '',
        copyFromEnvironmentId: fixture.productionEnvironmentId,
      }),
    ).rejects.toThrow(BadRequestError);

    await expect(
      fixture.engine.useCases.createProjectEnvironment(GLOBAL_CONTEXT, {
        identity: fixture.identity,
        projectId: fixture.projectId,
        name: 'Invalid@Name!',
        copyFromEnvironmentId: fixture.productionEnvironmentId,
      }),
    ).rejects.toThrow('Environment name must be 1-50 characters');
  });

  it('should throw error when source environment not found', async () => {
    await expect(
      fixture.engine.useCases.createProjectEnvironment(GLOBAL_CONTEXT, {
        identity: fixture.identity,
        projectId: fixture.projectId,
        name: 'NewEnv',
        copyFromEnvironmentId: '00000000-0000-0000-0000-000000000000',
      }),
    ).rejects.toThrow('Source environment not found');
  });

  it('should copy config variants from source environment', async () => {
    // Create a config first
    await fixture.createConfig({
      name: 'test-config',
      value: asConfigValue('original'),
      schema: null,
      overrides: [],
      description: 'Test config',
      identity: fixture.identity,
      editorEmails: [],
      maintainerEmails: [],
      projectId: fixture.projectId,
    });

    // Create new environment
    const {environmentId} = await fixture.engine.useCases.createProjectEnvironment(GLOBAL_CONTEXT, {
      identity: fixture.identity,
      projectId: fixture.projectId,
      name: 'Staging',
      copyFromEnvironmentId: fixture.productionEnvironmentId,
    });

    // Get config and verify the new environment has a variant
    const {config} = await fixture.trpc.getConfig({
      name: 'test-config',
      projectId: fixture.projectId,
    });

    const stagingVariant = config?.variants.find(v => v.environmentId === environmentId);
    expect(stagingVariant).toBeDefined();
    expect(stagingVariant?.value).toBe(stringifyJsonc('original'));
  });

  it('should append new environment at the end of order', async () => {
    const {environmentId} = await fixture.engine.useCases.createProjectEnvironment(GLOBAL_CONTEXT, {
      identity: fixture.identity,
      projectId: fixture.projectId,
      name: 'Staging',
      copyFromEnvironmentId: fixture.productionEnvironmentId,
    });

    const {environments} = await fixture.engine.useCases.getProjectEnvironments(GLOBAL_CONTEXT, {
      identity: fixture.identity,
      projectId: fixture.projectId,
    });

    const staging = environments.find(e => e.id === environmentId);
    expect(staging?.order).toBeGreaterThan(1);
    expect(staging?.order).toBe(environments.length);
  });
});

describe('updateProjectEnvironment', () => {
  const fixture = useAppFixture({authEmail: ADMIN_USER_EMAIL});

  it('should update environment name', async () => {
    // Create an environment to update
    const {environmentId} = await fixture.engine.useCases.createProjectEnvironment(GLOBAL_CONTEXT, {
      identity: fixture.identity,
      projectId: fixture.projectId,
      name: 'Staging',
      copyFromEnvironmentId: fixture.productionEnvironmentId,
    });

    await fixture.engine.useCases.updateProjectEnvironment(GLOBAL_CONTEXT, {
      identity: fixture.identity,
      projectId: fixture.projectId,
      environmentId,
      name: 'QA',
      requireProposals: false,
    });

    const {environments} = await fixture.engine.useCases.getProjectEnvironments(GLOBAL_CONTEXT, {
      identity: fixture.identity,
      projectId: fixture.projectId,
    });

    const qa = environments.find(e => e.id === environmentId);
    expect(qa?.name).toBe('QA');
  });

  it('should throw error when renaming to existing environment name', async () => {
    // Create two environments
    const {environmentId} = await fixture.engine.useCases.createProjectEnvironment(GLOBAL_CONTEXT, {
      identity: fixture.identity,
      projectId: fixture.projectId,
      name: 'Staging',
      copyFromEnvironmentId: fixture.productionEnvironmentId,
    });

    // Try to rename Staging to Production (which already exists)
    await expect(
      fixture.engine.useCases.updateProjectEnvironment(GLOBAL_CONTEXT, {
        identity: fixture.identity,
        projectId: fixture.projectId,
        environmentId,
        name: 'Production',
        requireProposals: false,
      }),
    ).rejects.toThrow(BadRequestError);

    await expect(
      fixture.engine.useCases.updateProjectEnvironment(GLOBAL_CONTEXT, {
        identity: fixture.identity,
        projectId: fixture.projectId,
        environmentId,
        name: 'Production',
        requireProposals: false,
      }),
    ).rejects.toThrow('Environment with this name already exists');
  });

  it('should throw error when renaming conflicts case-insensitively', async () => {
    const {environmentId} = await fixture.engine.useCases.createProjectEnvironment(GLOBAL_CONTEXT, {
      identity: fixture.identity,
      projectId: fixture.projectId,
      name: 'Staging',
      copyFromEnvironmentId: fixture.productionEnvironmentId,
    });

    await expect(
      fixture.engine.useCases.updateProjectEnvironment(GLOBAL_CONTEXT, {
        identity: fixture.identity,
        projectId: fixture.projectId,
        environmentId,
        name: 'PRODUCTION',
        requireProposals: false,
      }),
    ).rejects.toThrow('Environment with this name already exists');
  });

  it('should allow updating to the same name (case-sensitive)', async () => {
    const {environmentId} = await fixture.engine.useCases.createProjectEnvironment(GLOBAL_CONTEXT, {
      identity: fixture.identity,
      projectId: fixture.projectId,
      name: 'Staging',
      copyFromEnvironmentId: fixture.productionEnvironmentId,
    });

    // Should not throw - updating to the same name is allowed
    await fixture.engine.useCases.updateProjectEnvironment(GLOBAL_CONTEXT, {
      identity: fixture.identity,
      projectId: fixture.projectId,
      environmentId,
      name: 'Staging',
      requireProposals: true,
    });

    const {environments} = await fixture.engine.useCases.getProjectEnvironments(GLOBAL_CONTEXT, {
      identity: fixture.identity,
      projectId: fixture.projectId,
    });

    const staging = environments.find(e => e.id === environmentId);
    expect(staging?.name).toBe('Staging');
    expect(staging?.requireProposals).toBe(true);
  });

  it('should throw error when environment not found', async () => {
    await expect(
      fixture.engine.useCases.updateProjectEnvironment(GLOBAL_CONTEXT, {
        identity: fixture.identity,
        projectId: fixture.projectId,
        environmentId: '00000000-0000-0000-0000-000000000000',
        name: 'NewName',
        requireProposals: false,
      }),
    ).rejects.toThrow('Environment not found');
  });

  it('should throw error when environment name is invalid', async () => {
    await expect(
      fixture.engine.useCases.updateProjectEnvironment(GLOBAL_CONTEXT, {
        identity: fixture.identity,
        projectId: fixture.projectId,
        environmentId: fixture.productionEnvironmentId,
        name: 'Invalid@Name!',
        requireProposals: false,
      }),
    ).rejects.toThrow('Environment name must be 1-50 characters');
  });

  it('should update requireProposals setting', async () => {
    const {environmentId} = await fixture.engine.useCases.createProjectEnvironment(GLOBAL_CONTEXT, {
      identity: fixture.identity,
      projectId: fixture.projectId,
      name: 'Staging',
      copyFromEnvironmentId: fixture.productionEnvironmentId,
    });

    // Initially requireProposals is true
    let {environments} = await fixture.engine.useCases.getProjectEnvironments(GLOBAL_CONTEXT, {
      identity: fixture.identity,
      projectId: fixture.projectId,
    });
    let staging = environments.find(e => e.id === environmentId);
    expect(staging?.requireProposals).toBe(true);

    // Update to false
    await fixture.engine.useCases.updateProjectEnvironment(GLOBAL_CONTEXT, {
      identity: fixture.identity,
      projectId: fixture.projectId,
      environmentId,
      name: 'Staging',
      requireProposals: false,
    });

    ({environments} = await fixture.engine.useCases.getProjectEnvironments(GLOBAL_CONTEXT, {
      identity: fixture.identity,
      projectId: fixture.projectId,
    }));
    staging = environments.find(e => e.id === environmentId);
    expect(staging?.requireProposals).toBe(false);
  });
});

describe('deleteProjectEnvironment', () => {
  const fixture = useAppFixture({authEmail: ADMIN_USER_EMAIL});

  it('should delete an environment', async () => {
    // Create an environment to delete
    const {environmentId} = await fixture.engine.useCases.createProjectEnvironment(GLOBAL_CONTEXT, {
      identity: fixture.identity,
      projectId: fixture.projectId,
      name: 'ToDelete',
      copyFromEnvironmentId: fixture.productionEnvironmentId,
    });

    await fixture.engine.useCases.deleteProjectEnvironment(GLOBAL_CONTEXT, {
      identity: fixture.identity,
      projectId: fixture.projectId,
      environmentId,
    });

    const {environments} = await fixture.engine.useCases.getProjectEnvironments(GLOBAL_CONTEXT, {
      identity: fixture.identity,
      projectId: fixture.projectId,
    });

    expect(environments.find(e => e.id === environmentId)).toBeUndefined();
  });

  it('should delete config variants when environment is deleted', async () => {
    // Create a config
    await fixture.createConfig({
      name: 'test-delete-env',
      value: asConfigValue('test'),
      schema: null,
      overrides: [],
      description: 'Test',
      identity: fixture.identity,
      editorEmails: [],
      maintainerEmails: [],
      projectId: fixture.projectId,
    });

    // Create an environment
    const {environmentId} = await fixture.engine.useCases.createProjectEnvironment(GLOBAL_CONTEXT, {
      identity: fixture.identity,
      projectId: fixture.projectId,
      name: 'ToDelete',
      copyFromEnvironmentId: fixture.productionEnvironmentId,
    });

    // Verify variant exists
    let {config} = await fixture.trpc.getConfig({
      name: 'test-delete-env',
      projectId: fixture.projectId,
    });
    expect(config?.variants.find(v => v.environmentId === environmentId)).toBeDefined();

    // Delete environment
    await fixture.engine.useCases.deleteProjectEnvironment(GLOBAL_CONTEXT, {
      identity: fixture.identity,
      projectId: fixture.projectId,
      environmentId,
    });

    // Verify variant is gone
    ({config} = await fixture.trpc.getConfig({
      name: 'test-delete-env',
      projectId: fixture.projectId,
    }));
    expect(config?.variants.find(v => v.environmentId === environmentId)).toBeUndefined();
  });

  it('should throw error when trying to delete last environment', async () => {
    // Delete Development, leaving only Production
    await fixture.engine.useCases.deleteProjectEnvironment(GLOBAL_CONTEXT, {
      identity: fixture.identity,
      projectId: fixture.projectId,
      environmentId: fixture.developmentEnvironmentId,
    });

    // Try to delete Production (last remaining)
    await expect(
      fixture.engine.useCases.deleteProjectEnvironment(GLOBAL_CONTEXT, {
        identity: fixture.identity,
        projectId: fixture.projectId,
        environmentId: fixture.productionEnvironmentId,
      }),
    ).rejects.toThrow(BadRequestError);

    await expect(
      fixture.engine.useCases.deleteProjectEnvironment(GLOBAL_CONTEXT, {
        identity: fixture.identity,
        projectId: fixture.projectId,
        environmentId: fixture.productionEnvironmentId,
      }),
    ).rejects.toThrow('Cannot delete the last environment');
  });

  it('should throw error when environment not found', async () => {
    await expect(
      fixture.engine.useCases.deleteProjectEnvironment(GLOBAL_CONTEXT, {
        identity: fixture.identity,
        projectId: fixture.projectId,
        environmentId: '00000000-0000-0000-0000-000000000000',
      }),
    ).rejects.toThrow('Environment not found');
  });
});

describe('updateProjectEnvironmentsOrder', () => {
  const fixture = useAppFixture({authEmail: ADMIN_USER_EMAIL});

  it('should reorder environments', async () => {
    // Create a third environment
    const {environmentId: stagingId} = await fixture.engine.useCases.createProjectEnvironment(
      GLOBAL_CONTEXT,
      {
        identity: fixture.identity,
        projectId: fixture.projectId,
        name: 'Staging',
        copyFromEnvironmentId: fixture.productionEnvironmentId,
      },
    );

    // Reorder: Staging first, then Production, then Development
    await fixture.engine.useCases.updateProjectEnvironmentsOrder(GLOBAL_CONTEXT, {
      identity: fixture.identity,
      projectId: fixture.projectId,
      environmentOrders: [
        {environmentId: stagingId, order: 1},
        {environmentId: fixture.productionEnvironmentId, order: 2},
        {environmentId: fixture.developmentEnvironmentId, order: 3},
      ],
    });

    const {environments} = await fixture.engine.useCases.getProjectEnvironments(GLOBAL_CONTEXT, {
      identity: fixture.identity,
      projectId: fixture.projectId,
    });

    expect(environments[0].name).toBe('Staging');
    expect(environments[1].name).toBe('Production');
    expect(environments[2].name).toBe('Development');
  });
});
