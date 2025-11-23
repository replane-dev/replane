import {type Config} from '@/engine/core/config-store';
import {GLOBAL_CONTEXT} from '@/engine/core/context';
import type {Override} from '@/engine/core/override-evaluator';
import {evaluateConfigValue} from '@/engine/core/override-evaluator';
import {normalizeEmail} from '@/engine/core/utils';
import {v4 as uuidv4} from 'uuid';
import {describe, expect, it} from 'vitest';
import {useAppFixture} from './fixtures/trpc-fixture';

const CURRENT_USER_EMAIL = normalizeEmail('test@example.com');

function sleep(ms: number) {
  return new Promise(r => setTimeout(r, ms));
}

describe('Override Evaluation', () => {
  const fixture = useAppFixture({authEmail: CURRENT_USER_EMAIL});

  describe('Type Casting', () => {
    it('should cast string rule value to number when context is number', () => {
      const config: Config = {
        id: uuidv4(),
        name: 'test',
        projectId: 'proj',
        description: '',
        schema: null,
        createdAt: new Date(),
        updatedAt: new Date(),
        creatorId: 1,
        version: 1,
        value: 10,
        overrides: [
          {
            name: 'Test',
            conditions: [
              {
                operator: 'equals',
                property: 'count',
                value: '100', // String in rule
              },
            ],
            value: 1000,
          },
        ],
      };

      expect(evaluateConfigValue(config, {count: 100}).finalValue).toBe(1000);
    });

    it('should cast number rule value to string when context is string', () => {
      const config: Config = {
        id: uuidv4(),
        name: 'test',
        projectId: 'proj',
        description: '',
        schema: null,
        createdAt: new Date(),
        updatedAt: new Date(),
        creatorId: 1,
        version: 1,
        value: 'default',
        overrides: [
          {
            name: 'Test',
            conditions: [
              {
                operator: 'equals',
                property: 'status',
                value: 200, // Number in rule
              },
            ],
            value: 'success',
          },
        ],
      };

      expect(evaluateConfigValue(config, {status: '200'}).finalValue).toBe('success');
    });

    it('should cast boolean strings to boolean', () => {
      const config: Config = {
        id: uuidv4(),
        name: 'test',
        projectId: 'proj',
        description: '',
        schema: null,
        createdAt: new Date(),
        updatedAt: new Date(),
        creatorId: 1,
        version: 1,
        value: 'disabled',
        overrides: [
          {
            name: 'Test',
            conditions: [
              {
                operator: 'equals',
                property: 'enabled',
                value: 'true', // String in rule
              },
            ],
            value: 'enabled',
          },
        ],
      };

      expect(evaluateConfigValue(config, {enabled: true}).finalValue).toBe('enabled');
    });
  });

  describe('Operators', () => {
    it('should work with equals operator', () => {
      const config: Config = {
        id: uuidv4(),
        name: 'test',
        projectId: 'proj',
        description: '',
        schema: null,
        createdAt: new Date(),
        updatedAt: new Date(),
        creatorId: 1,
        version: 1,
        value: 'default',
        overrides: [
          {
            name: 'US Override',
            conditions: [
              {
                operator: 'equals',
                property: 'country',
                value: 'US',
              },
            ],
            value: 'us-value',
          },
        ],
      };

      expect(evaluateConfigValue(config, {country: 'US'}).finalValue).toBe('us-value');
      expect(evaluateConfigValue(config, {country: 'UK'}).finalValue).toBe('default');
    });

    it('should work with not_in operator', () => {
      const config: Config = {
        id: uuidv4(),
        name: 'test',
        projectId: 'proj',
        description: '',
        schema: null,
        createdAt: new Date(),
        updatedAt: new Date(),
        creatorId: 1,
        version: 1,
        value: 'blocked',
        overrides: [
          {
            name: 'Allowed Countries',
            conditions: [
              {
                operator: 'not_in',
                property: 'country',
                value: ['CN', 'RU', 'KP'],
              },
            ],
            value: 'allowed',
          },
        ],
      };

      expect(evaluateConfigValue(config, {country: 'US'}).finalValue).toBe('allowed');
      expect(evaluateConfigValue(config, {country: 'CN'}).finalValue).toBe('blocked');
    });

    it('should work with less_than operator', () => {
      const config: Config = {
        id: uuidv4(),
        name: 'test',
        projectId: 'proj',
        description: '',
        schema: null,
        createdAt: new Date(),
        updatedAt: new Date(),
        creatorId: 1,
        version: 1,
        value: 10,
        overrides: [
          {
            name: 'New Users',
            conditions: [
              {
                operator: 'less_than',
                property: 'accountAge',
                value: 30,
              },
            ],
            value: 5,
          },
        ],
      };

      expect(evaluateConfigValue(config, {accountAge: 15}).finalValue).toBe(5);
      expect(evaluateConfigValue(config, {accountAge: 45}).finalValue).toBe(10);
      expect(evaluateConfigValue(config, {accountAge: 30}).finalValue).toBe(10);
    });

    it('should work with less_than_or_equal operator', () => {
      const config: Config = {
        id: uuidv4(),
        name: 'test',
        projectId: 'proj',
        description: '',
        schema: null,
        createdAt: new Date(),
        updatedAt: new Date(),
        creatorId: 1,
        version: 1,
        value: 'over',
        overrides: [
          {
            name: 'Within Limit',
            conditions: [
              {
                operator: 'less_than_or_equal',
                property: 'count',
                value: 100,
              },
            ],
            value: 'ok',
          },
        ],
      };

      expect(evaluateConfigValue(config, {count: 50}).finalValue).toBe('ok');
      expect(evaluateConfigValue(config, {count: 100}).finalValue).toBe('ok');
      expect(evaluateConfigValue(config, {count: 101}).finalValue).toBe('over');
    });

    it('should work with greater_than operator', () => {
      const config: Config = {
        id: uuidv4(),
        name: 'test',
        projectId: 'proj',
        description: '',
        schema: null,
        createdAt: new Date(),
        updatedAt: new Date(),
        creatorId: 1,
        version: 1,
        value: 'standard',
        overrides: [
          {
            name: 'High Credit',
            conditions: [
              {
                operator: 'greater_than',
                property: 'creditScore',
                value: 700,
              },
            ],
            value: 'premium',
          },
        ],
      };

      expect(evaluateConfigValue(config, {creditScore: 750}).finalValue).toBe('premium');
      expect(evaluateConfigValue(config, {creditScore: 650}).finalValue).toBe('standard');
      expect(evaluateConfigValue(config, {creditScore: 700}).finalValue).toBe('standard');
    });

    it('should work with greater_than_or_equal operator', () => {
      const config: Config = {
        id: uuidv4(),
        name: 'test',
        projectId: 'proj',
        description: '',
        schema: null,
        createdAt: new Date(),
        updatedAt: new Date(),
        creatorId: 1,
        version: 1,
        value: 'junior',
        overrides: [
          {
            name: 'Senior',
            conditions: [
              {
                operator: 'greater_than_or_equal',
                property: 'age',
                value: 18,
              },
            ],
            value: 'adult',
          },
        ],
      };

      expect(evaluateConfigValue(config, {age: 25}).finalValue).toBe('adult');
      expect(evaluateConfigValue(config, {age: 18}).finalValue).toBe('adult');
      expect(evaluateConfigValue(config, {age: 17}).finalValue).toBe('junior');
    });
  });

  describe('Composite Operators', () => {
    it('should work with AND operator', () => {
      const config: Config = {
        id: uuidv4(),
        name: 'test',
        projectId: 'proj',
        description: '',
        schema: null,
        createdAt: new Date(),
        updatedAt: new Date(),
        creatorId: 1,
        version: 1,
        value: 'base',
        overrides: [
          {
            name: 'VIP Premium',
            conditions: [
              {
                operator: 'and',
                conditions: [
                  {
                    operator: 'equals',
                    property: 'userEmail',
                    value: 'vip@example.com',
                  },
                  {
                    operator: 'equals',
                    property: 'tier',
                    value: 'premium',
                  },
                ],
              },
            ],
            value: 'vip-premium',
          },
        ],
      };

      expect(
        evaluateConfigValue(config, {userEmail: 'vip@example.com', tier: 'premium'}).finalValue,
      ).toBe('vip-premium');
      expect(
        evaluateConfigValue(config, {userEmail: 'vip@example.com', tier: 'free'}).finalValue,
      ).toBe('base');
    });

    it('should work with OR operator', () => {
      const config: Config = {
        id: uuidv4(),
        name: 'test',
        projectId: 'proj',
        description: '',
        schema: null,
        createdAt: new Date(),
        updatedAt: new Date(),
        creatorId: 1,
        version: 1,
        value: 'limited',
        overrides: [
          {
            name: 'Admin Access',
            conditions: [
              {
                operator: 'or',
                conditions: [
                  {
                    operator: 'equals',
                    property: 'userEmail',
                    value: 'admin@example.com',
                  },
                  {
                    operator: 'equals',
                    property: 'role',
                    value: 'admin',
                  },
                ],
              },
            ],
            value: 'admin-access',
          },
        ],
      };

      expect(
        evaluateConfigValue(config, {userEmail: 'admin@example.com', role: 'user'}).finalValue,
      ).toBe('admin-access');
      expect(
        evaluateConfigValue(config, {userEmail: 'user@example.com', role: 'admin'}).finalValue,
      ).toBe('admin-access');
      expect(
        evaluateConfigValue(config, {userEmail: 'user@example.com', role: 'user'}).finalValue,
      ).toBe('limited');
    });

    it('should work with NOT operator', () => {
      const config: Config = {
        id: uuidv4(),
        name: 'test',
        projectId: 'proj',
        description: '',
        schema: null,
        createdAt: new Date(),
        updatedAt: new Date(),
        creatorId: 1,
        version: 1,
        value: 'normal',
        overrides: [
          {
            name: 'Not Banned',
            conditions: [
              {
                operator: 'not',
                condition: {
                  operator: 'equals',
                  property: 'status',
                  value: 'banned',
                },
              },
            ],
            value: 'active',
          },
        ],
      };

      expect(evaluateConfigValue(config, {status: 'active'}).finalValue).toBe('active');
      expect(evaluateConfigValue(config, {status: 'banned'}).finalValue).toBe('normal');
    });

    it('should handle nested composite rules', () => {
      const config: Config = {
        id: uuidv4(),
        name: 'test',
        projectId: 'proj',
        description: '',
        schema: null,
        createdAt: new Date(),
        updatedAt: new Date(),
        creatorId: 1,
        version: 1,
        value: 'base',
        overrides: [
          {
            name: 'Special Access',
            conditions: [
              {
                operator: 'or',
                conditions: [
                  {
                    operator: 'and',
                    conditions: [
                      {
                        operator: 'equals',
                        property: 'country',
                        value: 'US',
                      },
                      {
                        operator: 'equals',
                        property: 'tier',
                        value: 'premium',
                      },
                    ],
                  },
                  {
                    operator: 'equals',
                    property: 'userEmail',
                    value: 'vip@example.com',
                  },
                ],
              },
            ],
            value: 'special',
          },
        ],
      };

      // US premium users get special
      expect(evaluateConfigValue(config, {country: 'US', tier: 'premium'}).finalValue).toBe(
        'special',
      );

      // VIP users get special
      expect(
        evaluateConfigValue(config, {userEmail: 'vip@example.com', tier: 'free'}).finalValue,
      ).toBe('special');

      // US free users don't get special
      expect(evaluateConfigValue(config, {country: 'US', tier: 'free'}).finalValue).toBe('base');

      // Non-US premium users don't get special
      expect(evaluateConfigValue(config, {country: 'UK', tier: 'premium'}).finalValue).toBe('base');
    });
  });

  describe('Multiple Conditions (Implicit AND)', () => {
    it('should require all conditions to match', () => {
      const config: Config = {
        id: uuidv4(),
        name: 'test',
        projectId: 'proj',
        description: '',
        schema: null,
        createdAt: new Date(),
        updatedAt: new Date(),
        creatorId: 1,
        version: 1,
        value: 'base',
        overrides: [
          {
            name: 'VIP Premium',
            conditions: [
              {
                operator: 'equals',
                property: 'userEmail',
                value: 'vip@example.com',
              },
              {
                operator: 'equals',
                property: 'tier',
                value: 'premium',
              },
            ],
            value: 'vip-premium',
          },
        ],
      };

      // Both conditions match
      expect(
        evaluateConfigValue(config, {userEmail: 'vip@example.com', tier: 'premium'}).finalValue,
      ).toBe('vip-premium');

      // Only first condition matches
      expect(
        evaluateConfigValue(config, {userEmail: 'vip@example.com', tier: 'free'}).finalValue,
      ).toBe('base');

      // Neither condition matches
      expect(
        evaluateConfigValue(config, {userEmail: 'user@example.com', tier: 'free'}).finalValue,
      ).toBe('base');
    });
  });

  describe('Multiple Overrides (Priority)', () => {
    it('should return first matching override', () => {
      const config: Config = {
        id: uuidv4(),
        name: 'test',
        projectId: 'proj',
        description: '',
        schema: null,
        createdAt: new Date(),
        updatedAt: new Date(),
        creatorId: 1,
        version: 1,
        value: 'base',
        overrides: [
          {
            name: 'Admin',
            conditions: [
              {
                operator: 'equals',
                property: 'userEmail',
                value: 'admin@example.com',
              },
            ],
            value: 'admin-override',
          },
          {
            name: 'Premium',
            conditions: [
              {
                operator: 'equals',
                property: 'tier',
                value: 'premium',
              },
            ],
            value: 'premium-override',
          },
        ],
      };

      // First override matches
      expect(
        evaluateConfigValue(config, {userEmail: 'admin@example.com', tier: 'premium'}).finalValue,
      ).toBe('admin-override');

      // Second override matches
      expect(
        evaluateConfigValue(config, {userEmail: 'user@example.com', tier: 'premium'}).finalValue,
      ).toBe('premium-override');

      // No override matches
      expect(
        evaluateConfigValue(config, {userEmail: 'user@example.com', tier: 'free'}).finalValue,
      ).toBe('base');
    });
  });

  describe('Edge Cases', () => {
    it('should return base value when no overrides defined', () => {
      const config: Config = {
        id: uuidv4(),
        name: 'test',
        projectId: 'proj',
        description: '',
        schema: null,
        createdAt: new Date(),
        updatedAt: new Date(),
        creatorId: 1,
        version: 1,
        value: 'base',
        overrides: [],
      };

      expect(evaluateConfigValue(config, {userEmail: 'test@example.com'}).finalValue).toBe('base');
    });

    it('should return base value when overrides array is empty', () => {
      const config: Config = {
        id: uuidv4(),
        name: 'test',
        projectId: 'proj',
        description: '',
        schema: null,
        createdAt: new Date(),
        updatedAt: new Date(),
        creatorId: 1,
        version: 1,
        value: 'base',
        overrides: [],
      };

      expect(evaluateConfigValue(config, {userEmail: 'test@example.com'}).finalValue).toBe('base');
    });

    it('should handle missing context properties', () => {
      const config: Config = {
        id: uuidv4(),
        name: 'test',
        projectId: 'proj',
        description: '',
        schema: null,
        createdAt: new Date(),
        updatedAt: new Date(),
        creatorId: 1,
        version: 1,
        value: 'base',
        overrides: [
          {
            name: 'Test',
            conditions: [
              {
                operator: 'equals',
                property: 'country',
                value: 'US',
              },
            ],
            value: 'override',
          },
        ],
      };

      expect(evaluateConfigValue(config, {userEmail: 'test@example.com'}).finalValue).toBe('base');
      expect(evaluateConfigValue(config, {}).finalValue).toBe('base');
    });
  });

  describe('Debug Information', () => {
    it('should provide detailed evaluation results', () => {
      const config: Config = {
        id: uuidv4(),
        name: 'test',
        projectId: 'proj',
        description: '',
        schema: null,
        createdAt: new Date(),
        updatedAt: new Date(),
        creatorId: 1,
        version: 1,
        value: 'base',
        overrides: [
          {
            name: 'Premium',
            conditions: [
              {
                operator: 'equals',
                property: 'tier',
                value: 'premium',
              },
            ],
            value: 'premium-value',
          },
        ],
      };

      const result = evaluateConfigValue(config, {tier: 'premium'});

      expect(result.finalValue).toBe('premium-value');
      expect(result.matchedOverride).toEqual(config.overrides![0]);
      expect(result.overrideEvaluations).toHaveLength(1);
      expect(result.overrideEvaluations[0].matched).toBe(true);
      expect(result.overrideEvaluations[0].conditionEvaluations).toHaveLength(1);
      expect(result.overrideEvaluations[0].conditionEvaluations[0].matched).toBe(true);
    });

    it('should show why conditions failed', () => {
      const config: Config = {
        id: uuidv4(),
        name: 'test',
        projectId: 'proj',
        description: '',
        schema: null,
        createdAt: new Date(),
        updatedAt: new Date(),
        creatorId: 1,
        version: 1,
        value: 'base',
        overrides: [
          {
            name: 'Premium',
            conditions: [
              {
                operator: 'equals',
                property: 'tier',
                value: 'premium',
              },
            ],
            value: 'premium-value',
          },
        ],
      };

      const result = evaluateConfigValue(config, {tier: 'free'});

      expect(result.finalValue).toBe('base');
      expect(result.matchedOverride).toBeNull();
      expect(result.overrideEvaluations[0].matched).toBe(false);
      expect(result.overrideEvaluations[0].conditionEvaluations[0].matched).toBe(false);
      expect(result.overrideEvaluations[0].conditionEvaluations[0].reason).toContain('expected');
    });

    it('should provide nested evaluation details', () => {
      const config: Config = {
        id: uuidv4(),
        name: 'test',
        projectId: 'proj',
        description: '',
        schema: null,
        createdAt: new Date(),
        updatedAt: new Date(),
        creatorId: 1,
        version: 1,
        value: 'base',
        overrides: [
          {
            name: 'Complex',
            conditions: [
              {
                operator: 'and',
                conditions: [
                  {
                    operator: 'equals',
                    property: 'country',
                    value: 'US',
                  },
                  {
                    operator: 'equals',
                    property: 'tier',
                    value: 'premium',
                  },
                ],
              },
            ],
            value: 'special',
          },
        ],
      };

      const result = evaluateConfigValue(config, {country: 'US', tier: 'free'});

      expect(result.matchedOverride).toBeNull();
      expect(result.overrideEvaluations[0].matched).toBe(false);
      expect(result.overrideEvaluations[0].conditionEvaluations[0].nestedEvaluations).toHaveLength(
        2,
      );
      expect(
        result.overrideEvaluations[0].conditionEvaluations[0].nestedEvaluations![0].matched,
      ).toBe(true); // country matches
      expect(
        result.overrideEvaluations[0].conditionEvaluations[0].nestedEvaluations![1].matched,
      ).toBe(false); // tier doesn't match
    });

    it('should show type casting in debug output', () => {
      const config: Config = {
        id: uuidv4(),
        name: 'test',
        projectId: 'proj',
        description: '',
        schema: null,
        createdAt: new Date(),
        updatedAt: new Date(),
        creatorId: 1,
        version: 1,
        value: 'base',
        overrides: [
          {
            name: 'Test',
            conditions: [
              {
                operator: 'equals',
                property: 'count',
                value: '100', // String
              },
            ],
            value: 'matched',
          },
        ],
      };

      const result = evaluateConfigValue(config, {count: 100}); // Number

      expect(result.finalValue).toBe('matched');
      expect(result.overrideEvaluations[0].conditionEvaluations[0].reason).toContain('casted');
    });
  });

  describe('Integration Tests', () => {
    it('should create config with overrides and evaluate them', async () => {
      const overrides: Override[] = [
        {
          name: 'VIP Users',
          conditions: [
            {
              operator: 'equals',
              property: 'userEmail',
              value: 'vip@example.com',
            },
          ],
          value: {maxItems: 100},
        },
        {
          name: 'Premium Tier',
          conditions: [
            {
              operator: 'equals',
              property: 'tier',
              value: 'premium',
            },
          ],
          value: {maxItems: 50},
        },
      ];

      await fixture.engine.useCases.createConfig(GLOBAL_CONTEXT, {
        name: 'max_items_config',
        value: {maxItems: 10},
        schema: null,
        overrides,
        description: 'Config with overrides',
        currentUserEmail: CURRENT_USER_EMAIL,
        editorEmails: [],
        maintainerEmails: [CURRENT_USER_EMAIL],
        projectId: fixture.projectId,
      });

      await sleep(50);

      // Test base value
      const baseResult = await fixture.engine.useCases.getConfigValue(GLOBAL_CONTEXT, {
        name: 'max_items_config',
        projectId: fixture.projectId,
      });
      expect(baseResult.value).toEqual({maxItems: 10});

      // Test VIP user override
      const vipResult = await fixture.engine.useCases.getConfigValue(GLOBAL_CONTEXT, {
        name: 'max_items_config',
        projectId: fixture.projectId,
        context: {userEmail: 'vip@example.com'},
      });
      expect(vipResult.value).toEqual({maxItems: 100});

      // Test premium tier override
      const premiumResult = await fixture.engine.useCases.getConfigValue(GLOBAL_CONTEXT, {
        name: 'max_items_config',
        projectId: fixture.projectId,
        context: {userEmail: 'regular@example.com', tier: 'premium'},
      });
      expect(premiumResult.value).toEqual({maxItems: 50});

      // Test regular user (no override match)
      const regularResult = await fixture.engine.useCases.getConfigValue(GLOBAL_CONTEXT, {
        name: 'max_items_config',
        projectId: fixture.projectId,
        context: {userEmail: 'regular@example.com', tier: 'free'},
      });
      expect(regularResult.value).toEqual({maxItems: 10});
    });

    it('should update overrides via patchConfig', async () => {
      const {configId} = await fixture.engine.useCases.createConfig(GLOBAL_CONTEXT, {
        name: 'feature_flag',
        value: false,
        schema: null,
        overrides: null,
        description: 'Feature flag',
        currentUserEmail: CURRENT_USER_EMAIL,
        editorEmails: [],
        maintainerEmails: [CURRENT_USER_EMAIL],
        projectId: fixture.projectId,
      });

      const newOverrides: Override[] = [
        {
          name: 'Enabled Users',
          conditions: [
            {
              operator: 'equals',
              property: 'enabled',
              value: true,
            },
          ],
          value: true,
        },
      ];

      await fixture.engine.useCases.patchConfig(GLOBAL_CONTEXT, {
        configId,
        overrides: {newOverrides},
        currentUserEmail: CURRENT_USER_EMAIL,
        prevVersion: 1,
      });

      await sleep(50);

      // Verify override works
      const enabledResult = await fixture.engine.useCases.getConfigValue(GLOBAL_CONTEXT, {
        name: 'feature_flag',
        projectId: fixture.projectId,
        context: {enabled: true},
      });
      expect(enabledResult.value).toBe(true);

      const disabledResult = await fixture.engine.useCases.getConfigValue(GLOBAL_CONTEXT, {
        name: 'feature_flag',
        projectId: fixture.projectId,
        context: {enabled: false},
      });
      expect(disabledResult.value).toBe(false);
    });

    it('should work with type casting in production', async () => {
      const overrides: Override[] = [
        {
          name: 'Age Check',
          conditions: [
            {
              operator: 'greater_than',
              property: 'age',
              value: '18', // String in rule
            },
          ],
          value: {access: 'adult'},
        },
      ];

      await fixture.engine.useCases.createConfig(GLOBAL_CONTEXT, {
        name: 'age_restricted',
        value: {access: 'child'},
        schema: null,
        overrides,
        description: 'Age-restricted config',
        currentUserEmail: CURRENT_USER_EMAIL,
        editorEmails: [],
        maintainerEmails: [CURRENT_USER_EMAIL],
        projectId: fixture.projectId,
      });

      await sleep(50);

      // Number context should work with string rule
      const adult = await fixture.engine.useCases.getConfigValue(GLOBAL_CONTEXT, {
        name: 'age_restricted',
        projectId: fixture.projectId,
        context: {age: 25},
      });
      expect(adult.value).toEqual({access: 'adult'});

      const minor = await fixture.engine.useCases.getConfigValue(GLOBAL_CONTEXT, {
        name: 'age_restricted',
        projectId: fixture.projectId,
        context: {age: 15},
      });
      expect(minor.value).toEqual({access: 'child'});
    });
  });
});
