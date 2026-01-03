import {GLOBAL_CONTEXT} from '@/engine/core/context';
import {BadRequestError} from '@/engine/core/errors';
import {normalizeEmail, stringifyJsonc, toSettledResult} from '@/engine/core/utils';
import type {ConfigSchema, ConfigValue} from '@/engine/core/zod';
import {TRPCError} from '@trpc/server';
import {assert, beforeEach, describe, expect, it} from 'vitest';
import {useAppFixture} from './fixtures/app-fixture';

function asConfigValue(value: unknown): ConfigValue {
  return stringifyJsonc(value) as ConfigValue;
}

function asConfigSchema(value: unknown): ConfigSchema {
  return stringifyJsonc(value) as ConfigSchema;
}

const CURRENT_USER_EMAIL = normalizeEmail('test@example.com');

describe('Per-Environment Approvals', () => {
  const fixture = useAppFixture({authEmail: CURRENT_USER_EMAIL});

  describe('when project has requireProposals=true', () => {
    beforeEach(async () => {
      // Enable requireProposals on the project
      await fixture.engine.useCases.patchProject(GLOBAL_CONTEXT, {
        id: fixture.projectId,
        details: {
          name: 'Test Project',
          description: 'Default project for tests',
          requireProposals: true,
          allowSelfApprovals: true,
        },
        identity: await fixture.emailToIdentity(CURRENT_USER_EMAIL),
      });
    });

    describe('and no environments have requireProposals=true', () => {
      beforeEach(async () => {
        // Disable requireProposals on both environments
        await fixture.trpc.updateProjectEnvironment({
          environmentId: fixture.productionEnvironmentId,
          name: 'Production',
          projectId: fixture.projectId,
          requireProposals: false,
        });
        await fixture.trpc.updateProjectEnvironment({
          environmentId: fixture.developmentEnvironmentId,
          name: 'Development',
          projectId: fixture.projectId,
          requireProposals: false,
        });
      });

      it('should allow direct save when updating environment variants only', async () => {
        const {configId} = await fixture.createConfig({
          overrides: [],
          name: 'direct_save_no_approval_required',
          value: asConfigValue({x: 1}),
          schema: null,
          description: 'Test config',
          identity: await fixture.emailToIdentity(CURRENT_USER_EMAIL),
          editorEmails: [],
          maintainerEmails: [CURRENT_USER_EMAIL],
          projectId: fixture.projectId,
        });

        // Update environment variants only - should succeed since no environments require approval
        await fixture.trpc.updateConfig({
          projectId: fixture.projectId,
          configName: 'direct_save_no_approval_required',
          description: 'Updated description',
          editorEmails: [],
          maintainerEmails: [CURRENT_USER_EMAIL],
          defaultVariant: {
            value: asConfigValue({x: 1}), // Keep default value the same
            schema: null,
            overrides: [],
          },
          environmentVariants: [
            {
              environmentId: fixture.productionEnvironmentId,
              value: asConfigValue({x: 2}), // Change environment variant
              schema: null,
              overrides: [],
              useBaseSchema: false,
            },
            {
              environmentId: fixture.developmentEnvironmentId,
              value: asConfigValue({x: 3}), // Change environment variant
              schema: null,
              overrides: [],
              useBaseSchema: false,
            },
          ],
          prevVersion: 1,
        });

        const {config} = await fixture.trpc.getConfig({
          name: 'direct_save_no_approval_required',
          projectId: fixture.projectId,
        });

        expect(config?.config.version).toBe(2);
        expect(config?.config.description).toBe('Updated description');
      });
    });

    describe('and only production environment has requireProposals=true', () => {
      beforeEach(async () => {
        // Ensure only production requires proposals
        await fixture.trpc.updateProjectEnvironment({
          environmentId: fixture.productionEnvironmentId,
          name: 'Production',
          projectId: fixture.projectId,
          requireProposals: true,
        });
        // Development should not require proposals
        await fixture.trpc.updateProjectEnvironment({
          environmentId: fixture.developmentEnvironmentId,
          name: 'Development',
          projectId: fixture.projectId,
          requireProposals: false,
        });
      });

      it('should block direct save when default value changes and production has no override', async () => {
        const {configId} = await fixture.createConfig({
          overrides: [],
          name: 'block_default_change',
          value: asConfigValue({x: 1}),
          schema: null,
          description: 'Test config',
          identity: await fixture.emailToIdentity(CURRENT_USER_EMAIL),
          editorEmails: [],
          maintainerEmails: [CURRENT_USER_EMAIL],
          projectId: fixture.projectId,
        });

        // Try to update the default value - should fail because production requires proposals
        // and production has no environment override (uses default value)
        const result = await toSettledResult(
          fixture.trpc.updateConfig({
            projectId: fixture.projectId,
            configName: 'block_default_change',
            description: 'Updated description',
            editorEmails: [],
            maintainerEmails: [CURRENT_USER_EMAIL],
            defaultVariant: {
              value: asConfigValue({x: 999}), // Changed default value
              schema: null,
              overrides: [],
            },
            // No environment variants - production uses default value
            environmentVariants: [],
            prevVersion: 1,
          }),
        );

        assert(result.type === 'error', 'result should be an error');
        assert(result.error instanceof TRPCError, 'error should be a TRPCError');
        assert(result.error.cause instanceof BadRequestError, 'error should be a BadRequestError');
      });

      it('should allow direct save when default value changes but production has override', async () => {
        // Temporarily disable requireProposals on production to set up the test data
        await fixture.trpc.updateProjectEnvironment({
          environmentId: fixture.productionEnvironmentId,
          name: 'Production',
          projectId: fixture.projectId,
          requireProposals: false,
        });

        const {configId} = await fixture.createConfig({
          overrides: [],
          name: 'allow_default_change_with_override',
          value: asConfigValue({x: 1}),
          schema: null,
          description: 'Test config',
          identity: await fixture.emailToIdentity(CURRENT_USER_EMAIL),
          editorEmails: [],
          maintainerEmails: [CURRENT_USER_EMAIL],
          projectId: fixture.projectId,
        });

        // Add a production environment override with a different value
        await fixture.trpc.updateConfig({
          projectId: fixture.projectId,
          configName: 'allow_default_change_with_override',
          description: 'Test config',
          editorEmails: [],
          maintainerEmails: [CURRENT_USER_EMAIL],
          defaultVariant: {
            value: asConfigValue({x: 1}),
            schema: null,
            overrides: [],
          },
          environmentVariants: [
            {
              environmentId: fixture.productionEnvironmentId,
              value: asConfigValue({x: 100}), // Production-specific value (different from default)
              schema: null,
              overrides: [],
              useBaseSchema: false,
            },
          ],
          prevVersion: 1,
        });

        // Re-enable requireProposals on production
        await fixture.trpc.updateProjectEnvironment({
          environmentId: fixture.productionEnvironmentId,
          name: 'Production',
          projectId: fixture.projectId,
          requireProposals: true,
        });

        // Now try to update the default value - should succeed because production has an override
        const result = await toSettledResult(
          fixture.trpc.updateConfig({
            projectId: fixture.projectId,
            configName: 'allow_default_change_with_override',
            description: 'Updated description',
            editorEmails: [],
            maintainerEmails: [CURRENT_USER_EMAIL],
            defaultVariant: {
              value: asConfigValue({x: 999}), // Changed default value
              schema: null,
              overrides: [],
            },
            environmentVariants: [
              {
                environmentId: fixture.productionEnvironmentId,
                value: asConfigValue({x: 100}), // Same production value (unchanged)
                schema: null,
                overrides: [],
                useBaseSchema: false,
              },
            ],
            prevVersion: 2,
          }),
        );

        assert(result.type === 'success', 'result should be a success');
      });

      it('should block direct save when production environment value changes', async () => {
        const {configId} = await fixture.createConfig({
          overrides: [],
          name: 'block_prod_change',
          value: asConfigValue({x: 1}),
          schema: null,
          description: 'Test config',
          identity: await fixture.emailToIdentity(CURRENT_USER_EMAIL),
          editorEmails: [],
          maintainerEmails: [CURRENT_USER_EMAIL],
          projectId: fixture.projectId,
        });

        // Try to update production environment value - should fail
        const result = await toSettledResult(
          fixture.trpc.updateConfig({
            projectId: fixture.projectId,
            configName: 'block_prod_change',
            description: 'Test config',
            editorEmails: [],
            maintainerEmails: [CURRENT_USER_EMAIL],
            defaultVariant: {
              value: asConfigValue({x: 1}), // Same as before
              schema: null,
              overrides: [],
            },
            environmentVariants: [
              {
                environmentId: fixture.productionEnvironmentId,
                value: asConfigValue({x: 999}), // Changed production value
                schema: null,
                overrides: [],
                useBaseSchema: false,
              },
              {
                environmentId: fixture.developmentEnvironmentId,
                value: asConfigValue({x: 1}), // Same as before
                schema: null,
                overrides: [],
                useBaseSchema: false,
              },
            ],
            prevVersion: 1,
          }),
        );

        assert(result.type === 'error', 'result should be an error');
        assert(result.error instanceof TRPCError, 'error should be a TRPCError');
        assert(result.error.cause instanceof BadRequestError, 'error should be a BadRequestError');
      });

      it('should allow direct save when only development environment value changes', async () => {
        const {configId} = await fixture.createConfig({
          overrides: [],
          name: 'allow_dev_change',
          value: asConfigValue({x: 1}),
          schema: null,
          description: 'Test config',
          identity: await fixture.emailToIdentity(CURRENT_USER_EMAIL),
          editorEmails: [],
          maintainerEmails: [CURRENT_USER_EMAIL],
          projectId: fixture.projectId,
        });

        // Update only development environment value - should succeed
        await fixture.trpc.updateConfig({
          projectId: fixture.projectId,
          configName: 'allow_dev_change',
          description: 'Test config',
          editorEmails: [],
          maintainerEmails: [CURRENT_USER_EMAIL],
          defaultVariant: {
            value: asConfigValue({x: 1}), // Same as before
            schema: null,
            overrides: [],
          },
          environmentVariants: [
            {
              environmentId: fixture.productionEnvironmentId,
              value: asConfigValue({x: 1}), // Same as before
              schema: null,
              overrides: [],
              useBaseSchema: false,
            },
            {
              environmentId: fixture.developmentEnvironmentId,
              value: asConfigValue({x: 999}), // Changed development value - should be allowed
              schema: null,
              overrides: [],
              useBaseSchema: false,
            },
          ],
          prevVersion: 1,
        });

        const {config} = await fixture.trpc.getConfig({
          name: 'allow_dev_change',
          projectId: fixture.projectId,
        });

        expect(config?.config.version).toBe(2);
        // Check that development variant was updated
        const devVariant = config?.variants.find(
          v => v.environmentId === fixture.developmentEnvironmentId,
        );
        expect(devVariant?.value).toEqual(asConfigValue({x: 999}));
      });

      it('should allow direct save when only description changes', async () => {
        const {configId} = await fixture.createConfig({
          overrides: [],
          name: 'allow_description_change',
          value: asConfigValue({x: 1}),
          schema: null,
          description: 'Original description',
          identity: await fixture.emailToIdentity(CURRENT_USER_EMAIL),
          editorEmails: [],
          maintainerEmails: [CURRENT_USER_EMAIL],
          projectId: fixture.projectId,
        });

        // Update only description - should succeed (no value changes)
        await fixture.trpc.updateConfig({
          projectId: fixture.projectId,
          configName: 'allow_description_change',
          description: 'Updated description',
          editorEmails: [],
          maintainerEmails: [CURRENT_USER_EMAIL],
          defaultVariant: {
            value: asConfigValue({x: 1}), // Same as before
            schema: null,
            overrides: [],
          },
          environmentVariants: [
            {
              environmentId: fixture.productionEnvironmentId,
              value: asConfigValue({x: 1}), // Same as before
              schema: null,
              overrides: [],
              useBaseSchema: false,
            },
            {
              environmentId: fixture.developmentEnvironmentId,
              value: asConfigValue({x: 1}), // Same as before
              schema: null,
              overrides: [],
              useBaseSchema: false,
            },
          ],
          prevVersion: 1,
        });

        const {config} = await fixture.trpc.getConfig({
          name: 'allow_description_change',
          projectId: fixture.projectId,
        });

        expect(config?.config.version).toBe(2);
        expect(config?.config.description).toBe('Updated description');
      });
    });

    describe('and both environments have requireProposals=true', () => {
      beforeEach(async () => {
        // Set requireProposals=true on both environments
        await fixture.trpc.updateProjectEnvironment({
          environmentId: fixture.productionEnvironmentId,
          name: 'Production',
          projectId: fixture.projectId,
          requireProposals: true,
        });
        await fixture.trpc.updateProjectEnvironment({
          environmentId: fixture.developmentEnvironmentId,
          name: 'Development',
          projectId: fixture.projectId,
          requireProposals: true,
        });
      });

      it('should block direct save when any environment value changes', async () => {
        const {configId} = await fixture.createConfig({
          overrides: [],
          name: 'block_any_env_change',
          value: asConfigValue({x: 1}),
          schema: null,
          description: 'Test config',
          identity: await fixture.emailToIdentity(CURRENT_USER_EMAIL),
          editorEmails: [],
          maintainerEmails: [CURRENT_USER_EMAIL],
          projectId: fixture.projectId,
        });

        // Try to update development environment value - should fail because both require approval
        const result = await toSettledResult(
          fixture.trpc.updateConfig({
            projectId: fixture.projectId,
            configName: 'block_any_env_change',
            description: 'Test config',
            editorEmails: [],
            maintainerEmails: [CURRENT_USER_EMAIL],
            defaultVariant: {
              value: asConfigValue({x: 1}),
              schema: null,
              overrides: [],
            },
            environmentVariants: [
              {
                environmentId: fixture.productionEnvironmentId,
                value: asConfigValue({x: 1}), // Same as before
                schema: null,
                overrides: [],
                useBaseSchema: false,
              },
              {
                environmentId: fixture.developmentEnvironmentId,
                value: asConfigValue({x: 999}), // Changed development value
                schema: null,
                overrides: [],
                useBaseSchema: false,
              },
            ],
            prevVersion: 1,
          }),
        );

        assert(result.type === 'error', 'result should be an error');
        assert(result.error instanceof TRPCError, 'error should be a TRPCError');
        assert(result.error.cause instanceof BadRequestError, 'error should be a BadRequestError');
      });

      it('should block direct save when adding an editor', async () => {
        const {configId} = await fixture.createConfig({
          overrides: [],
          name: 'block_add_editor',
          value: asConfigValue({x: 1}),
          schema: null,
          description: 'Test config',
          identity: await fixture.emailToIdentity(CURRENT_USER_EMAIL),
          editorEmails: [],
          maintainerEmails: [CURRENT_USER_EMAIL],
          projectId: fixture.projectId,
        });

        const newEditorEmail = normalizeEmail('neweditor@example.com');

        // Try to add an editor - should fail
        const result = await toSettledResult(
          fixture.trpc.updateConfig({
            projectId: fixture.projectId,
            configName: 'block_add_editor',
            description: 'Test config',
            editorEmails: [newEditorEmail],
            maintainerEmails: [CURRENT_USER_EMAIL],
            defaultVariant: {
              value: asConfigValue({x: 1}), // Same as before
              schema: null,
              overrides: [],
            },
            environmentVariants: [
              {
                environmentId: fixture.productionEnvironmentId,
                value: asConfigValue({x: 1}), // Same as before
                schema: null,
                overrides: [],
                useBaseSchema: false,
              },
              {
                environmentId: fixture.developmentEnvironmentId,
                value: asConfigValue({x: 1}), // Same as before
                schema: null,
                overrides: [],
                useBaseSchema: false,
              },
            ],
            prevVersion: 1,
          }),
        );

        assert(result.type === 'error', 'result should be an error');
        assert(result.error instanceof TRPCError, 'error should be a TRPCError');
        assert(result.error.cause instanceof BadRequestError, 'error should be a BadRequestError');
      });

      it('should block direct save when removing a maintainer', async () => {
        const otherMaintainerEmail = normalizeEmail('othermaintainer@example.com');

        const {configId} = await fixture.createConfig({
          overrides: [],
          name: 'block_remove_maintainer',
          value: asConfigValue({x: 1}),
          schema: null,
          description: 'Test config',
          identity: await fixture.emailToIdentity(CURRENT_USER_EMAIL),
          editorEmails: [],
          maintainerEmails: [CURRENT_USER_EMAIL, otherMaintainerEmail],
          projectId: fixture.projectId,
        });

        // Try to remove a maintainer - should fail
        const result = await toSettledResult(
          fixture.trpc.updateConfig({
            projectId: fixture.projectId,
            configName: 'block_remove_maintainer',
            description: 'Test config',
            editorEmails: [],
            maintainerEmails: [CURRENT_USER_EMAIL], // Removed otherMaintainerEmail
            defaultVariant: {
              value: asConfigValue({x: 1}), // Same as before
              schema: null,
              overrides: [],
            },
            environmentVariants: [
              {
                environmentId: fixture.productionEnvironmentId,
                value: asConfigValue({x: 1}), // Same as before
                schema: null,
                overrides: [],
                useBaseSchema: false,
              },
              {
                environmentId: fixture.developmentEnvironmentId,
                value: asConfigValue({x: 1}), // Same as before
                schema: null,
                overrides: [],
                useBaseSchema: false,
              },
            ],
            prevVersion: 1,
          }),
        );

        assert(result.type === 'error', 'result should be an error');
        assert(result.error instanceof TRPCError, 'error should be a TRPCError');
        assert(result.error.cause instanceof BadRequestError, 'error should be a BadRequestError');
      });

      it('should allow direct save when description changes but members stay the same', async () => {
        const {configId} = await fixture.createConfig({
          overrides: [],
          name: 'allow_description_change',
          value: asConfigValue({x: 1}),
          schema: null,
          description: 'Original description',
          identity: await fixture.emailToIdentity(CURRENT_USER_EMAIL),
          editorEmails: [],
          maintainerEmails: [CURRENT_USER_EMAIL],
          projectId: fixture.projectId,
        });

        // Update only description - should succeed (no value or member changes)
        await fixture.trpc.updateConfig({
          projectId: fixture.projectId,
          configName: 'allow_description_change',
          description: 'Updated description',
          editorEmails: [],
          maintainerEmails: [CURRENT_USER_EMAIL],
          defaultVariant: {
            value: asConfigValue({x: 1}), // Same as before
            schema: null,
            overrides: [],
          },
          environmentVariants: [
            {
              environmentId: fixture.productionEnvironmentId,
              value: asConfigValue({x: 1}), // Same as before
              schema: null,
              overrides: [],
              useBaseSchema: false,
            },
            {
              environmentId: fixture.developmentEnvironmentId,
              value: asConfigValue({x: 1}), // Same as before
              schema: null,
              overrides: [],
              useBaseSchema: false,
            },
          ],
          prevVersion: 1,
        });

        const {config} = await fixture.trpc.getConfig({
          name: 'allow_description_change',
          projectId: fixture.projectId,
        });

        expect(config?.config.version).toBe(2);
        expect(config?.config.description).toBe('Updated description');
      });
    });
  });

  describe('when project has requireProposals=false', () => {
    it('should allow direct save even when environments have requireProposals=true', async () => {
      // Set requireProposals=true on production
      await fixture.trpc.updateProjectEnvironment({
        environmentId: fixture.productionEnvironmentId,
        name: 'Production',
        projectId: fixture.projectId,
        requireProposals: true,
      });

      const {configId} = await fixture.createConfig({
        overrides: [],
        name: 'direct_save_proposals_disabled',
        value: asConfigValue({x: 1}),
        schema: null,
        description: 'Test config',
        identity: await fixture.emailToIdentity(CURRENT_USER_EMAIL),
        editorEmails: [],
        maintainerEmails: [CURRENT_USER_EMAIL],
        projectId: fixture.projectId,
      });

      // Update the config - should succeed since project doesn't require proposals
      await fixture.trpc.updateConfig({
        projectId: fixture.projectId,
        configName: 'direct_save_proposals_disabled',
        description: 'Updated description',
        editorEmails: [],
        maintainerEmails: [CURRENT_USER_EMAIL],
        defaultVariant: {
          value: asConfigValue({x: 999}),
          schema: null,
          overrides: [],
        },
        environmentVariants: [
          {
            environmentId: fixture.productionEnvironmentId,
            value: asConfigValue({x: 999}),
            schema: null,
            overrides: [],
            useBaseSchema: false,
          },
          {
            environmentId: fixture.developmentEnvironmentId,
            value: asConfigValue({x: 999}),
            schema: null,
            overrides: [],
            useBaseSchema: false,
          },
        ],
        prevVersion: 1,
      });

      const {config} = await fixture.trpc.getConfig({
        name: 'direct_save_proposals_disabled',
        projectId: fixture.projectId,
      });

      expect(config?.config.version).toBe(2);
      expect(config?.config.value).toEqual(asConfigValue({x: 999}));
    });
  });
});

describe('Environment requireProposals setting', () => {
  const fixture = useAppFixture({authEmail: CURRENT_USER_EMAIL});

  it('should be able to set requireProposals on an environment', async () => {
    // Update production to require approvals
    await fixture.trpc.updateProjectEnvironment({
      environmentId: fixture.productionEnvironmentId,
      name: 'Production',
      projectId: fixture.projectId,
      requireProposals: true,
    });

    const {environments} = await fixture.trpc.getProjectEnvironments({
      projectId: fixture.projectId,
    });

    const production = environments.find(e => e.id === fixture.productionEnvironmentId);
    expect(production?.requireProposals).toBe(true);
  });

  it('should be able to disable requireProposals on an environment', async () => {
    // First enable it
    await fixture.trpc.updateProjectEnvironment({
      environmentId: fixture.productionEnvironmentId,
      name: 'Production',
      projectId: fixture.projectId,
      requireProposals: true,
    });

    // Then disable it
    await fixture.trpc.updateProjectEnvironment({
      environmentId: fixture.productionEnvironmentId,
      name: 'Production',
      projectId: fixture.projectId,
      requireProposals: false,
    });

    const {environments} = await fixture.trpc.getProjectEnvironments({
      projectId: fixture.projectId,
    });

    const production = environments.find(e => e.id === fixture.productionEnvironmentId);
    expect(production?.requireProposals).toBe(false);
  });

  it('should default new environments to requireProposals=true', async () => {
    // Create a new environment
    const {environmentId} = await fixture.trpc.createProjectEnvironment({
      projectId: fixture.projectId,
      name: 'Staging',
      copyFromEnvironmentId: fixture.productionEnvironmentId,
    });

    const {environments} = await fixture.trpc.getProjectEnvironments({
      projectId: fixture.projectId,
    });

    const staging = environments.find(e => e.id === environmentId);
    expect(staging?.requireProposals).toBe(true);
  });
});

describe('restoreConfigVersion with per-environment approvals', () => {
  const fixture = useAppFixture({authEmail: CURRENT_USER_EMAIL});

  describe('when project has requireProposals=true and production has requireProposals=true', () => {
    beforeEach(async () => {
      // Enable requireProposals on the project
      await fixture.engine.useCases.patchProject(GLOBAL_CONTEXT, {
        id: fixture.projectId,
        details: {
          name: 'Test Project',
          description: 'Default project for tests',
          requireProposals: true,
          allowSelfApprovals: true,
        },
        identity: await fixture.emailToIdentity(CURRENT_USER_EMAIL),
      });

      // Set requireProposals=true on production
      await fixture.trpc.updateProjectEnvironment({
        environmentId: fixture.productionEnvironmentId,
        name: 'Production',
        projectId: fixture.projectId,
        requireProposals: true,
      });
    });

    it('should block restore when it would change an environment requiring approval', async () => {
      const {configId} = await fixture.createConfig({
        overrides: [],
        name: 'block_restore',
        value: asConfigValue({x: 1}),
        schema: null,
        description: 'Version 1',
        identity: await fixture.emailToIdentity(CURRENT_USER_EMAIL),
        editorEmails: [],
        maintainerEmails: [CURRENT_USER_EMAIL],
        projectId: fixture.projectId,
      });

      // Temporarily disable requireProposals to make a direct update
      await fixture.engine.useCases.patchProject(GLOBAL_CONTEXT, {
        id: fixture.projectId,
        details: {
          name: 'Test Project',
          description: 'Default project for tests',
          requireProposals: false,
          allowSelfApprovals: true,
        },
        identity: await fixture.emailToIdentity(CURRENT_USER_EMAIL),
      });

      // Update the config to version 2
      await fixture.trpc.updateConfig({
        projectId: fixture.projectId,
        configName: 'block_restore',
        description: 'Version 2',
        editorEmails: [],
        maintainerEmails: [CURRENT_USER_EMAIL],
        defaultVariant: {
          value: asConfigValue({x: 1}),
          schema: null,
          overrides: [],
        },
        environmentVariants: [
          {
            environmentId: fixture.productionEnvironmentId,
            value: asConfigValue({x: 2}), // Changed production value
            schema: null,
            overrides: [],
            useBaseSchema: false,
          },
          {
            environmentId: fixture.developmentEnvironmentId,
            value: asConfigValue({x: 2}), // Changed development value
            schema: null,
            overrides: [],
            useBaseSchema: false,
          },
        ],
        prevVersion: 1,
      });

      // Re-enable requireProposals
      await fixture.engine.useCases.patchProject(GLOBAL_CONTEXT, {
        id: fixture.projectId,
        details: {
          name: 'Test Project',
          description: 'Default project for tests',
          requireProposals: true,
          allowSelfApprovals: true,
        },
        identity: await fixture.emailToIdentity(CURRENT_USER_EMAIL),
      });

      // Try to restore to version 1 - should fail because production values would change
      const result = await toSettledResult(
        fixture.trpc.restoreConfigVersion({
          configId,
          versionToRestore: 1,
          expectedCurrentVersion: 2,
          projectId: fixture.projectId,
        }),
      );

      assert(result.type === 'error', 'result should be an error');
      assert(result.error instanceof TRPCError, 'error should be a TRPCError');
      assert(result.error.cause instanceof BadRequestError, 'error should be a BadRequestError');
    });
  });
});

describe('Schema and override changes with per-environment approvals', () => {
  const fixture = useAppFixture({authEmail: CURRENT_USER_EMAIL});

  beforeEach(async () => {
    // Enable requireProposals on the project
    await fixture.engine.useCases.patchProject(GLOBAL_CONTEXT, {
      id: fixture.projectId,
      details: {
        name: 'Test Project',
        description: 'Default project for tests',
        requireProposals: true,
        allowSelfApprovals: true,
      },
      identity: await fixture.emailToIdentity(CURRENT_USER_EMAIL),
    });

    // Set requireProposals=true on production only
    await fixture.trpc.updateProjectEnvironment({
      environmentId: fixture.productionEnvironmentId,
      name: 'Production',
      projectId: fixture.projectId,
      requireProposals: true,
    });

    // Disable requireProposals on development
    await fixture.trpc.updateProjectEnvironment({
      environmentId: fixture.developmentEnvironmentId,
      name: 'Development',
      projectId: fixture.projectId,
      requireProposals: false,
    });
  });

  it('should block direct save when production environment schema changes', async () => {
    const {configId} = await fixture.createConfig({
      overrides: [],
      name: 'block_schema_change',
      value: asConfigValue({x: 1}),
      schema: null,
      description: 'Test config',
      identity: await fixture.emailToIdentity(CURRENT_USER_EMAIL),
      editorEmails: [],
      maintainerEmails: [CURRENT_USER_EMAIL],
      projectId: fixture.projectId,
    });

    // Try to add a schema to production environment - should fail
    const result = await toSettledResult(
      fixture.trpc.updateConfig({
        projectId: fixture.projectId,
        configName: 'block_schema_change',
        description: 'Test config',
        editorEmails: [],
        maintainerEmails: [CURRENT_USER_EMAIL],
        defaultVariant: {
          value: asConfigValue({x: 1}),
          schema: null,
          overrides: [],
        },
        environmentVariants: [
          {
            environmentId: fixture.productionEnvironmentId,
            value: asConfigValue({x: 1}),
            schema: asConfigSchema({type: 'object'}), // Adding schema to production
            overrides: [],
            useBaseSchema: false,
          },
          {
            environmentId: fixture.developmentEnvironmentId,
            value: asConfigValue({x: 1}),
            schema: null,
            overrides: [],
            useBaseSchema: false,
          },
        ],
        prevVersion: 1,
      }),
    );

    assert(result.type === 'error', 'result should be an error');
    assert(result.error instanceof TRPCError, 'error should be a TRPCError');
    assert(result.error.cause instanceof BadRequestError, 'error should be a BadRequestError');
  });

  it('should block direct save when production environment overrides change', async () => {
    const {configId} = await fixture.createConfig({
      overrides: [],
      name: 'block_override_change',
      value: asConfigValue({x: 1}),
      schema: null,
      description: 'Test config',
      identity: await fixture.emailToIdentity(CURRENT_USER_EMAIL),
      editorEmails: [],
      maintainerEmails: [CURRENT_USER_EMAIL],
      projectId: fixture.projectId,
    });

    // Try to add overrides to production environment - should fail

    const result = await toSettledResult(
      fixture.trpc.updateConfig({
        projectId: fixture.projectId,
        configName: 'block_override_change',
        description: 'Test config',
        editorEmails: [],
        maintainerEmails: [CURRENT_USER_EMAIL],
        defaultVariant: {
          value: asConfigValue({x: 1}),
          schema: null,
          overrides: [],
        },
        environmentVariants: [
          {
            environmentId: fixture.productionEnvironmentId,
            value: asConfigValue({x: 1}),
            schema: null,
            overrides: [
              {
                name: 'test-override',
                value: asConfigValue({x: 999}),
                conditions: [],
              },
            ], // Adding override to production
            useBaseSchema: false,
          },
          {
            environmentId: fixture.developmentEnvironmentId,
            value: asConfigValue({x: 1}),
            schema: null,
            overrides: [],
            useBaseSchema: false,
          },
        ],
        prevVersion: 1,
      }),
    );
    assert(result.type === 'error', 'result should be an error');
    assert(result.error instanceof TRPCError, 'error should be a TRPCError');
    assert(result.error.cause instanceof BadRequestError, 'error should be a BadRequestError');
  });

  it('should allow schema and override changes in development environment', async () => {
    const {configId} = await fixture.createConfig({
      overrides: [],
      name: 'allow_dev_schema_change',
      value: asConfigValue({x: 1}),
      schema: null,
      description: 'Test config',
      identity: await fixture.emailToIdentity(CURRENT_USER_EMAIL),
      editorEmails: [],
      maintainerEmails: [CURRENT_USER_EMAIL],
      projectId: fixture.projectId,
    });

    // Add schema and overrides to development environment - should succeed
    await fixture.trpc.updateConfig({
      projectId: fixture.projectId,
      configName: 'allow_dev_schema_change',
      description: 'Test config',
      editorEmails: [],
      maintainerEmails: [CURRENT_USER_EMAIL],
      defaultVariant: {
        value: asConfigValue({x: 1}),
        schema: null,
        overrides: [],
      },
      environmentVariants: [
        {
          environmentId: fixture.productionEnvironmentId,
          value: asConfigValue({x: 1}),
          schema: null,
          overrides: [],
          useBaseSchema: false,
        },
        {
          environmentId: fixture.developmentEnvironmentId,
          value: asConfigValue({x: 1}),
          schema: asConfigSchema({type: 'object'}), // Adding schema to development
          overrides: [
            {
              name: 'test-override',
              value: asConfigValue({x: 999}),
              conditions: [],
            },
          ], // Adding override to development
          useBaseSchema: false,
        },
      ],
      prevVersion: 1,
    });

    const {config} = await fixture.trpc.getConfig({
      name: 'allow_dev_schema_change',
      projectId: fixture.projectId,
    });

    expect(config?.config.version).toBe(2);
    const devVariant = config?.variants.find(
      v => v.environmentId === fixture.developmentEnvironmentId,
    );
    expect(devVariant?.schema).toEqual(asConfigSchema({type: 'object'}));
    expect(devVariant?.overrides).toHaveLength(1);
  });
});
