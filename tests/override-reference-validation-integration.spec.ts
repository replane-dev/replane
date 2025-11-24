import {describe, expect, it} from 'vitest';
import {GLOBAL_CONTEXT} from '../src/engine/core/context';
import {BadRequestError} from '../src/engine/core/errors';
import type {Override} from '../src/engine/core/override-condition-schemas';
import {normalizeEmail} from '../src/engine/core/utils';
import {useAppFixture} from './fixtures/trpc-fixture';

const CURRENT_USER_EMAIL = normalizeEmail('test@example.com');

describe('Override Reference Validation - Integration Tests', () => {
  const fixture = useAppFixture({authEmail: CURRENT_USER_EMAIL});
  let projectIdB: string;

  it('setup second project for cross-project tests', async () => {
    // Create a second project for cross-project reference tests
    const result = await fixture.engine.useCases.createProject(GLOBAL_CONTEXT, {
      currentUserEmail: CURRENT_USER_EMAIL,
      name: 'Second Project',
      description: 'For cross-project testing',
    });
    projectIdB = result.projectId;
  });

  describe('createConfig', () => {
    it('should allow config creation without overrides', async () => {
      await fixture.engine.useCases.createConfig(GLOBAL_CONTEXT, {
        name: 'test-config',
        value: {enabled: true},
        description: 'Test config',
        schema: null,
        overrides: null,
        currentUserEmail: CURRENT_USER_EMAIL,
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
      await fixture.engine.useCases.createConfig(GLOBAL_CONTEXT, {
        name: 'vip-users',
        value: {users: ['alice@example.com', 'bob@example.com']},
        description: 'VIP user list',
        schema: null,
        overrides: null,
        currentUserEmail: CURRENT_USER_EMAIL,
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
          value: {maxItems: 1000},
        },
      ];

      await fixture.engine.useCases.createConfig(GLOBAL_CONTEXT, {
        name: 'user-limits',
        value: {maxItems: 10},
        description: 'User limits with VIP override',
        schema: null,
        overrides,
        currentUserEmail: CURRENT_USER_EMAIL,
        editorEmails: [],
        maintainerEmails: [CURRENT_USER_EMAIL],
        projectId: fixture.projectId,
      });

      // Should succeed
      const config = await fixture.trpc.getConfig({
        name: 'user-limits',
        projectId: fixture.projectId,
      });
      expect(config.config?.config.overrides).toEqual(overrides);
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
          value: {allowed: true},
        },
      ];

      await expect(
        fixture.engine.useCases.createConfig(GLOBAL_CONTEXT, {
          name: 'test-config-invalid',
          value: {enabled: false},
          description: 'Config with invalid reference',
          schema: null,
          overrides,
          currentUserEmail: CURRENT_USER_EMAIL,
          editorEmails: [],
          maintainerEmails: [CURRENT_USER_EMAIL],
          projectId: fixture.projectId,
        }),
      ).rejects.toThrow(BadRequestError);

      await expect(
        fixture.engine.useCases.createConfig(GLOBAL_CONTEXT, {
          name: 'test-config-invalid',
          value: {enabled: false},
          description: 'Config with invalid reference',
          schema: null,
          overrides,
          currentUserEmail: CURRENT_USER_EMAIL,
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
                  value: {type: 'literal', value: 'premium'},
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
          value: {feature: true},
        },
      ];

      await expect(
        fixture.engine.useCases.createConfig(GLOBAL_CONTEXT, {
          name: 'test-config-nested-invalid',
          value: {feature: false},
          description: 'Config with nested invalid reference',
          schema: null,
          overrides,
          currentUserEmail: CURRENT_USER_EMAIL,
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
      const configResult = await fixture.engine.useCases.createConfig(GLOBAL_CONTEXT, {
        name: 'patchable-config',
        value: {enabled: false},
        description: 'Config to patch',
        schema: null,
        overrides: null,
        currentUserEmail: CURRENT_USER_EMAIL,
        editorEmails: [],
        maintainerEmails: [CURRENT_USER_EMAIL],
        projectId: fixture.projectId,
      });
      const configId = configResult.configId;

      // Create referenced config
      await fixture.engine.useCases.createConfig(GLOBAL_CONTEXT, {
        name: 'allowed-users',
        value: {users: ['user1@example.com']},
        description: 'Allowed users',
        schema: null,
        overrides: null,
        currentUserEmail: CURRENT_USER_EMAIL,
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
          value: {enabled: true},
        },
      ];

      await fixture.engine.useCases.patchConfig(GLOBAL_CONTEXT, {
        configId,
        overrides: {newOverrides: overrides},
        currentUserEmail: CURRENT_USER_EMAIL,
        prevVersion: 1,
      });

      // Should succeed
      const config = await fixture.trpc.getConfig({
        name: 'patchable-config',
        projectId: fixture.projectId,
      });
      expect(config.config?.config.overrides).toEqual(overrides);
    });

    it('should reject patching config with cross-project reference', async () => {
      // Create a config to patch
      const configResult = await fixture.engine.useCases.createConfig(GLOBAL_CONTEXT, {
        name: 'patchable-config-2',
        value: {enabled: false},
        description: 'Config to patch',
        schema: null,
        overrides: null,
        currentUserEmail: CURRENT_USER_EMAIL,
        editorEmails: [],
        maintainerEmails: [CURRENT_USER_EMAIL],
        projectId: fixture.projectId,
      });
      const configId = configResult.configId;

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
          value: {enabled: true},
        },
      ];

      await expect(
        fixture.engine.useCases.patchConfig(GLOBAL_CONTEXT, {
          configId,
          overrides: {newOverrides: overrides},
          currentUserEmail: CURRENT_USER_EMAIL,
          prevVersion: 1,
        }),
      ).rejects.toThrow(BadRequestError);

      await expect(
        fixture.engine.useCases.patchConfig(GLOBAL_CONTEXT, {
          configId,
          overrides: {newOverrides: overrides},
          currentUserEmail: CURRENT_USER_EMAIL,
          prevVersion: 1,
        }),
      ).rejects.toThrow(/same project ID/);
    });
  });

  describe('createConfigProposal', () => {
    it('should allow proposal with valid same-project reference', async () => {
      // Create a config to propose changes to
      const configResult = await fixture.engine.useCases.createConfig(GLOBAL_CONTEXT, {
        name: 'proposable-config',
        value: {enabled: false},
        description: 'Config for proposals',
        schema: null,
        overrides: null,
        currentUserEmail: CURRENT_USER_EMAIL,
        editorEmails: [],
        maintainerEmails: [CURRENT_USER_EMAIL],
        projectId: fixture.projectId,
      });
      const configId = configResult.configId;

      // Create referenced config
      await fixture.engine.useCases.createConfig(GLOBAL_CONTEXT, {
        name: 'beta-testers',
        value: {emails: ['tester@example.com']},
        description: 'Beta tester list',
        schema: null,
        overrides: null,
        currentUserEmail: CURRENT_USER_EMAIL,
        editorEmails: [],
        maintainerEmails: [CURRENT_USER_EMAIL],
        projectId: fixture.projectId,
      });

      const overrides: Override[] = [
        {
          name: 'Beta Testers',
          conditions: [
            {
              operator: 'in',
              property: 'userEmail',
              value: {
                type: 'reference',
                projectId: fixture.projectId, // same project
                configName: 'beta-testers',
                path: ['emails'],
              },
            },
          ],
          value: {betaFeatures: true},
        },
      ];

      const result = await fixture.engine.useCases.createConfigProposal(GLOBAL_CONTEXT, {
        configId,
        baseVersion: 1,
        proposedOverrides: {newOverrides: overrides},
        currentUserEmail: CURRENT_USER_EMAIL,
      });

      // Should succeed - proposal created without validation errors
      expect(result.configProposalId).toBeDefined();
    });

    it('should reject proposal with cross-project reference', async () => {
      // Create a config to propose changes to
      const configResult = await fixture.engine.useCases.createConfig(GLOBAL_CONTEXT, {
        name: 'proposable-config-2',
        value: {enabled: false},
        description: 'Config for proposals',
        schema: null,
        overrides: null,
        currentUserEmail: CURRENT_USER_EMAIL,
        editorEmails: [],
        maintainerEmails: [CURRENT_USER_EMAIL],
        projectId: fixture.projectId,
      });
      const configId = configResult.configId;

      const overrides: Override[] = [
        {
          name: 'Invalid Proposal',
          conditions: [
            {
              operator: 'in',
              property: 'userId',
              value: {
                type: 'reference',
                projectId: projectIdB, // different project
                configName: 'user-ids',
                path: ['ids'],
              },
            },
          ],
          value: {access: true},
        },
      ];

      await expect(
        fixture.engine.useCases.createConfigProposal(GLOBAL_CONTEXT, {
          configId,
          baseVersion: 1,
          proposedOverrides: {newOverrides: overrides},
          currentUserEmail: CURRENT_USER_EMAIL,
        }),
      ).rejects.toThrow(BadRequestError);

      await expect(
        fixture.engine.useCases.createConfigProposal(GLOBAL_CONTEXT, {
          configId,
          baseVersion: 1,
          proposedOverrides: {newOverrides: overrides},
          currentUserEmail: CURRENT_USER_EMAIL,
        }),
      ).rejects.toThrow(/same project ID/);
    });

    it('should validate references when proposing override changes', async () => {
      // Create existing config with valid override
      const validConfigId = (
        await fixture.engine.useCases.createConfig(GLOBAL_CONTEXT, {
          name: 'config-with-override',
          value: {enabled: false},
          description: 'Has valid override',
          schema: null,
          overrides: [
            {
              name: 'Test',
              conditions: [
                {
                  operator: 'equals',
                  property: 'flag',
                  value: {type: 'literal', value: true},
                },
              ],
              value: {enabled: true},
            },
          ],
          currentUserEmail: CURRENT_USER_EMAIL,
          editorEmails: [],
          maintainerEmails: [CURRENT_USER_EMAIL],
          projectId: fixture.projectId,
        })
      ).configId;

      // Try to propose changing to invalid reference
      const invalidOverrides: Override[] = [
        {
          name: 'Invalid Update',
          conditions: [
            {
              operator: 'in',
              property: 'userId',
              value: {
                type: 'reference',
                projectId: projectIdB, // wrong project
                configName: 'users',
                path: [],
              },
            },
          ],
          value: {enabled: true},
        },
      ];

      await expect(
        fixture.engine.useCases.createConfigProposal(GLOBAL_CONTEXT, {
          configId: validConfigId,
          baseVersion: 1,
          proposedOverrides: {newOverrides: invalidOverrides},
          currentUserEmail: CURRENT_USER_EMAIL,
        }),
      ).rejects.toThrow(BadRequestError);
    });
  });

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
          value: {x: 1},
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
          value: {x: 2},
        },
      ];

      try {
        await fixture.engine.useCases.createConfig(GLOBAL_CONTEXT, {
          name: 'multi-ref-config',
          value: {x: 0},
          description: 'Multiple invalid references',
          schema: null,
          overrides,
          currentUserEmail: CURRENT_USER_EMAIL,
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
      await fixture.engine.useCases.createConfig(GLOBAL_CONTEXT, {
        name: 'premium-list',
        value: {users: ['premium@example.com']},
        description: 'Premium users',
        schema: null,
        overrides: null,
        currentUserEmail: CURRENT_USER_EMAIL,
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
              value: {type: 'literal', value: 'free'},
            },
          ],
          value: {limit: 10},
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
          value: {limit: 1000},
        },
      ];

      await fixture.engine.useCases.createConfig(GLOBAL_CONTEXT, {
        name: 'rate-limits',
        value: {limit: 100},
        description: 'Rate limits',
        schema: null,
        overrides,
        currentUserEmail: CURRENT_USER_EMAIL,
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
