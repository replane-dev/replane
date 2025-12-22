import {asConfigValue} from '@/engine/core/zod';
import {assert, describe, expect, it} from 'vitest';
import {GLOBAL_CONTEXT} from '../src/engine/core/context';
import {BadRequestError} from '../src/engine/core/errors';
import type {Override} from '../src/engine/core/override-condition-schemas';
import {normalizeEmail} from '../src/engine/core/utils';
import {emailToIdentity, useAppFixture} from './fixtures/trpc-fixture';

const CURRENT_USER_EMAIL = normalizeEmail('test@example.com');

describe('Override Reference Validation - Integration Tests', () => {
  const fixture = useAppFixture({authEmail: CURRENT_USER_EMAIL});
  let projectIdB: string;

  it('setup second project for cross-project tests', async () => {
    // Create a second project for cross-project reference tests
    const result = await fixture.engine.useCases.createProject(GLOBAL_CONTEXT, {
      identity: emailToIdentity(CURRENT_USER_EMAIL),
      workspaceId: fixture.workspaceId,
      name: 'Second Project',
      description: 'For cross-project testing',
    });
    projectIdB = result.projectId;
  });

  describe('createConfig', () => {
    it('should allow config creation without overrides', async () => {
      await fixture.createConfig({
        name: 'test-config',
        value: {enabled: true},
        description: 'Test config',
        schema: null,
        overrides: [],
        identity: emailToIdentity(CURRENT_USER_EMAIL),
        editorEmails: [],
        maintainerEmails: [CURRENT_USER_EMAIL],
        projectId: fixture.projectId,
      });

      // Should succeed
      const config = await fixture.trpc.getConfig({
        name: 'test-config',
        projectId: fixture.projectId,
      });
      expect(config.config).toBeDefined();
    });

    it('should allow config creation with valid same-project reference', async () => {
      // Create referenced config first
      await fixture.createConfig({
        name: 'vip-users',
        value: {users: ['alice@example.com', 'bob@example.com']},
        description: 'VIP user list',
        schema: null,
        overrides: [],
        identity: emailToIdentity(CURRENT_USER_EMAIL),
        editorEmails: [],
        maintainerEmails: [CURRENT_USER_EMAIL],
        projectId: fixture.projectId,
      });

      // Create config with reference to same project
      const overrides: Override[] = [
        {
          name: 'VIP Users',
          conditions: [
            {
              operator: 'in',
              property: 'userEmail',
              value: {
                type: 'reference',
                projectId: fixture.projectId, // same project
                configName: 'vip-users',
                path: ['users'],
              },
            },
          ],
          value: asConfigValue({maxItems: 1000}),
        },
      ];

      await fixture.createConfig({
        name: 'user-limits',
        value: asConfigValue({maxItems: 10}),
        description: 'User limits with VIP override',
        schema: null,
        overrides,
        identity: emailToIdentity(CURRENT_USER_EMAIL),
        editorEmails: [],
        maintainerEmails: [CURRENT_USER_EMAIL],
        projectId: fixture.projectId,
      });

      // Should succeed
      const config = await fixture.trpc.getConfig({
        name: 'user-limits',
        projectId: fixture.projectId,
      });
      // Overrides are now on variants, not config directly
      const productionVariant = config.config?.variants.find(
        v => v.environmentId === fixture.productionEnvironmentId,
      );
      expect(productionVariant?.overrides).toEqual(overrides);
    });

    it('should reject config creation with cross-project reference', async () => {
      const overrides: Override[] = [
        {
          name: 'Cross-Project Reference',
          conditions: [
            {
              operator: 'in',
              property: 'userId',
              value: {
                type: 'reference',
                projectId: projectIdB, // different project!
                configName: 'user-list',
                path: ['users'],
              },
            },
          ],
          value: asConfigValue({allowed: true}),
        },
      ];

      await expect(
        fixture.createConfig({
          name: 'test-config-invalid',
          value: asConfigValue({enabled: false}),
          description: 'Config with invalid reference',
          schema: null,
          overrides,
          identity: emailToIdentity(CURRENT_USER_EMAIL),
          editorEmails: [],
          maintainerEmails: [CURRENT_USER_EMAIL],
          projectId: fixture.projectId,
        }),
      ).rejects.toThrow(BadRequestError);

      await expect(
        fixture.createConfig({
          name: 'test-config-invalid',
          value: asConfigValue({enabled: false}),
          description: 'Config with invalid reference',
          schema: null,
          overrides,
          identity: emailToIdentity(CURRENT_USER_EMAIL),
          editorEmails: [],
          maintainerEmails: [CURRENT_USER_EMAIL],
          projectId: fixture.projectId,
        }),
      ).rejects.toThrow(/same project ID/);
    });

    it('should reject nested cross-project references', async () => {
      const overrides: Override[] = [
        {
          name: 'Nested Reference',
          conditions: [
            {
              operator: 'and',
              conditions: [
                {
                  operator: 'equals',
                  property: 'tier',
                  value: {type: 'literal', value: asConfigValue('premium')},
                },
                {
                  operator: 'in',
                  property: 'userId',
                  value: {
                    type: 'reference',
                    projectId: projectIdB, // wrong project
                    configName: 'premium-users',
                    path: ['ids'],
                  },
                },
              ],
            },
          ],
          value: asConfigValue({feature: true}),
        },
      ];

      await expect(
        fixture.createConfig({
          name: 'test-config-nested-invalid',
          value: asConfigValue({feature: false}),
          description: 'Config with nested invalid reference',
          schema: null,
          overrides,
          identity: emailToIdentity(CURRENT_USER_EMAIL),
          editorEmails: [],
          maintainerEmails: [CURRENT_USER_EMAIL],
          projectId: fixture.projectId,
        }),
      ).rejects.toThrow(BadRequestError);
    });
  });

  describe('patchConfig', () => {
    it('should allow patching config with valid same-project reference', async () => {
      // Create a config to patch
      const configResult = await fixture.createConfig({
        name: 'patchable-config',
        value: asConfigValue({enabled: false}),
        description: 'Config to patch',
        schema: null,
        overrides: [],
        identity: emailToIdentity(CURRENT_USER_EMAIL),
        editorEmails: [],
        maintainerEmails: [CURRENT_USER_EMAIL],
        projectId: fixture.projectId,
      });
      const configId = configResult.configId;

      // Create referenced config
      await fixture.createConfig({
        name: 'allowed-users',
        value: {users: ['user1@example.com']},
        description: 'Allowed users',
        schema: null,
        overrides: [],
        identity: emailToIdentity(CURRENT_USER_EMAIL),
        editorEmails: [],
        maintainerEmails: [CURRENT_USER_EMAIL],
        projectId: fixture.projectId,
      });

      const overrides: Override[] = [
        {
          name: 'Allowed Users Only',
          conditions: [
            {
              operator: 'in',
              property: 'userEmail',
              value: {
                type: 'reference',
                projectId: fixture.projectId, // same project
                configName: 'allowed-users',
                path: ['users'],
              },
            },
          ],
          value: asConfigValue({enabled: true}),
        },
      ];

      // Get variant for patching
      const variants = await fixture.engine.testing.configVariants.getByConfigId(configId);
      const variant = variants.find(v => v.environmentId === fixture.productionEnvironmentId);
      assert(variant, 'Production variant should exist');

      await fixture.engine.useCases.updateConfig(GLOBAL_CONTEXT, {
        configId,
        description: 'Config to patch',
        editorEmails: [],
        maintainerEmails: [CURRENT_USER_EMAIL],
        defaultVariant: {value: asConfigValue({enabled: false}), schema: null, overrides: []},
        environmentVariants: [
          {
            environmentId: fixture.productionEnvironmentId,
            value: asConfigValue({enabled: false}),
            schema: null,
            overrides: overrides,
            useDefaultSchema: false,
          },
          {
            environmentId: fixture.developmentEnvironmentId,
            value: asConfigValue({enabled: false}),
            schema: null,
            overrides: [],
            useDefaultSchema: false,
          },
        ],
        identity: emailToIdentity(CURRENT_USER_EMAIL),
        prevVersion: 1,
      });

      // Should succeed
      const config = await fixture.trpc.getConfig({
        name: 'patchable-config',
        projectId: fixture.projectId,
      });
      const productionVariant = config.config?.variants.find(
        v => v.environmentId === fixture.productionEnvironmentId,
      );
      expect(productionVariant?.overrides).toEqual(overrides);
    });

    it('should reject patching config variant with cross-project reference', async () => {
      // Create a config to patch
      const configResult = await fixture.createConfig({
        name: 'patchable-config-2',
        value: asConfigValue({enabled: false}),
        description: 'Config to patch',
        schema: null,
        overrides: [],
        identity: emailToIdentity(CURRENT_USER_EMAIL),
        editorEmails: [],
        maintainerEmails: [CURRENT_USER_EMAIL],
        projectId: fixture.projectId,
      });
      const configId = configResult.configId;

      // Get variant for patching
      const variants = await fixture.engine.testing.configVariants.getByConfigId(configId);
      const variant = variants.find(v => v.environmentId === fixture.productionEnvironmentId);
      assert(variant, 'Production variant should exist');

      const overrides: Override[] = [
        {
          name: 'Invalid Reference',
          conditions: [
            {
              operator: 'equals',
              property: 'flag',
              value: {
                type: 'reference',
                projectId: projectIdB, // different project
                configName: 'flag-value',
                path: ['value'],
              },
            },
          ],
          value: asConfigValue({enabled: true}),
        },
      ];

      await expect(
        fixture.engine.useCases.updateConfig(GLOBAL_CONTEXT, {
          configId,
          description: 'Config to patch',
          editorEmails: [],
          maintainerEmails: [CURRENT_USER_EMAIL],
          defaultVariant: {value: asConfigValue({enabled: false}), schema: null, overrides: []},
          environmentVariants: [
            {
              environmentId: fixture.productionEnvironmentId,
              value: asConfigValue({enabled: false}),
              schema: null,
              overrides: overrides,
              useDefaultSchema: false,
            },
            {
              environmentId: fixture.developmentEnvironmentId,
              value: asConfigValue({enabled: false}),
              schema: null,
              overrides: [],
              useDefaultSchema: false,
            },
          ],
          identity: emailToIdentity(CURRENT_USER_EMAIL),
          prevVersion: 1,
        }),
      ).rejects.toThrow(BadRequestError);

      await expect(
        fixture.engine.useCases.updateConfig(GLOBAL_CONTEXT, {
          configId,
          description: 'Config to patch',
          editorEmails: [],
          maintainerEmails: [CURRENT_USER_EMAIL],
          defaultVariant: {value: asConfigValue({enabled: false}), schema: null, overrides: []},
          environmentVariants: [
            {
              environmentId: fixture.productionEnvironmentId,
              value: asConfigValue({enabled: false}),
              schema: null,
              overrides: overrides,
              useDefaultSchema: false,
            },
            {
              environmentId: fixture.developmentEnvironmentId,
              value: asConfigValue({enabled: false}),
              schema: null,
              overrides: [],
              useDefaultSchema: false,
            },
          ],
          identity: emailToIdentity(CURRENT_USER_EMAIL),
          prevVersion: 1,
        }),
      ).rejects.toThrow(/same project ID/);
    });
  });

  // Note: createConfigVariantProposal use case doesn't exist yet
  // Override validation for variant proposals is tested via patchConfigVariant above

  describe('complex scenarios', () => {
    it('should validate multiple references in different overrides', async () => {
      const overrides: Override[] = [
        {
          name: 'Override 1',
          conditions: [
            {
              operator: 'in',
              property: 'userId',
              value: {
                type: 'reference',
                projectId: projectIdB, // wrong
                configName: 'list-1',
                path: [],
              },
            },
          ],
          value: asConfigValue({x: 1}),
        },
        {
          name: 'Override 2',
          conditions: [
            {
              operator: 'equals',
              property: 'flag',
              value: {
                type: 'reference',
                projectId: projectIdB, // wrong
                configName: 'list-2',
                path: [],
              },
            },
          ],
          value: asConfigValue({x: 2}),
        },
      ];

      try {
        await fixture.createConfig({
          name: 'multi-ref-config',
          value: asConfigValue({x: 0}),
          description: 'Multiple invalid references',
          schema: null,
          overrides,
          identity: emailToIdentity(CURRENT_USER_EMAIL),
          editorEmails: [],
          maintainerEmails: [CURRENT_USER_EMAIL],
          projectId: fixture.projectId,
        });
        expect.fail('Should have thrown');
      } catch (e) {
        expect(e).toBeInstanceOf(BadRequestError);
        const message = (e as BadRequestError).message;
        // Should mention both overrides
        expect(message).toContain('Override 1');
        expect(message).toContain('Override 2');
      }
    });

    it('should allow mix of literal and valid reference values', async () => {
      // Create referenced config
      await fixture.createConfig({
        name: 'premium-list',
        value: {users: ['premium@example.com']},
        description: 'Premium users',
        schema: null,
        overrides: [],
        identity: emailToIdentity(CURRENT_USER_EMAIL),
        editorEmails: [],
        maintainerEmails: [CURRENT_USER_EMAIL],
        projectId: fixture.projectId,
      });

      const overrides: Override[] = [
        {
          name: 'Literal Condition',
          conditions: [
            {
              operator: 'equals',
              property: 'tier',
              value: {type: 'literal', value: asConfigValue('free')},
            },
          ],
          value: asConfigValue({limit: 10}),
        },
        {
          name: 'Reference Condition',
          conditions: [
            {
              operator: 'in',
              property: 'userEmail',
              value: {
                type: 'reference',
                projectId: fixture.projectId, // correct
                configName: 'premium-list',
                path: ['users'],
              },
            },
          ],
          value: asConfigValue({limit: 1000}),
        },
      ];

      await fixture.createConfig({
        name: 'rate-limits',
        value: asConfigValue({limit: 100}),
        description: 'Rate limits',
        schema: null,
        overrides,
        identity: emailToIdentity(CURRENT_USER_EMAIL),
        editorEmails: [],
        maintainerEmails: [CURRENT_USER_EMAIL],
        projectId: fixture.projectId,
      });

      // Should succeed
      const config = await fixture.trpc.getConfig({
        name: 'rate-limits',
        projectId: fixture.projectId,
      });
      expect(config.config).toBeDefined();
    });
  });
});
