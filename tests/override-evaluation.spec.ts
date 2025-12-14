import {GLOBAL_CONTEXT} from '@/engine/core/context';
import type {Override} from '@/engine/core/override-evaluator';
import {evaluateConfigValue, renderOverrides} from '@/engine/core/override-evaluator';
import {normalizeEmail} from '@/engine/core/utils';
import {asConfigValue} from '@/engine/core/zod';
import {assert, describe, expect, it} from 'vitest';
import {useAppFixture} from './fixtures/trpc-fixture';

const CURRENT_USER_EMAIL = normalizeEmail('test@example.com');

function sleep(ms: number) {
  return new Promise(r => setTimeout(r, ms));
}

// Helper to quickly create literal values
const lit = (value: unknown) => ({type: 'literal' as const, value: asConfigValue(value)});

// Type for testing override evaluation (includes value/schema/overrides unlike Config)
type ConfigForEvaluation = {
  value: unknown;
  schema: unknown | null;
  overrides: Override[];
};

// Helper to evaluate config with rendering
async function evaluate(config: ConfigForEvaluation, context: Record<string, unknown>) {
  const rendered = await renderOverrides({
    overrides: config.overrides,
    configResolver: () => Promise.resolve(undefined),
    environmentId: 'production',
  });
  return evaluateConfigValue({value: asConfigValue(config.value), overrides: rendered}, context);
}

describe('Override Evaluation', () => {
  const fixture = useAppFixture({authEmail: CURRENT_USER_EMAIL});

  describe('Type Casting', () => {
    it('should cast string rule value to number when context is number', async () => {
      const config: ConfigForEvaluation = {
        schema: null,
        value: 10,
        overrides: [
          {
            name: 'Test',
            conditions: [
              {
                operator: 'equals',
                property: 'count',

                value: lit('100'), // String in rule
              },
            ],
            value: asConfigValue(1000),
          },
        ],
      };

      expect((await evaluate(config, {count: 100})).finalValue).toBe(1000);
    });

    it('should cast number rule value to string when context is string', async () => {
      const config: ConfigForEvaluation = {
        schema: null,
        value: 'default',
        overrides: [
          {
            name: 'Test',
            conditions: [
              {
                operator: 'equals',
                property: 'status',

                value: lit(200), // Number in rule
              },
            ],
            value: asConfigValue('success'),
          },
        ],
      };

      expect((await evaluate(config, {status: '200'})).finalValue).toBe('success');
    });

    it('should cast boolean strings to boolean', async () => {
      const config: ConfigForEvaluation = {
        schema: null,
        value: 'disabled',
        overrides: [
          {
            name: 'Test',
            conditions: [
              {
                operator: 'equals',
                property: 'enabled',

                value: lit('true'), // String in rule
              },
            ],
            value: asConfigValue('enabled'),
          },
        ],
      };

      expect((await evaluate(config, {enabled: true})).finalValue).toBe('enabled');
    });
  });

  describe('Operators', () => {
    it('should work with equals operator', async () => {
      const config: ConfigForEvaluation = {
        schema: null,
        value: 'default',
        overrides: [
          {
            name: 'US Override',
            conditions: [
              {
                operator: 'equals',
                property: 'country',

                value: lit('US'),
              },
            ],
            value: asConfigValue('us-value'),
          },
        ],
      };

      expect((await evaluate(config, {country: 'US'})).finalValue).toBe('us-value');
      expect((await evaluate(config, {country: 'UK'})).finalValue).toBe('default');
    });

    it('should work with not_in operator', async () => {
      const config: ConfigForEvaluation = {
        schema: null,
        value: 'blocked',
        overrides: [
          {
            name: 'Allowed Countries',
            conditions: [
              {
                operator: 'not_in',
                property: 'country',

                value: lit(['CN', 'RU', 'KP']),
              },
            ],
            value: asConfigValue('allowed'),
          },
        ],
      };

      expect((await evaluate(config, {country: 'US'})).finalValue).toBe('allowed');
      expect((await evaluate(config, {country: 'CN'})).finalValue).toBe('blocked');
    });

    it('should work with less_than operator', async () => {
      const config: ConfigForEvaluation = {
        schema: null,
        value: 10,
        overrides: [
          {
            name: 'New Users',
            conditions: [
              {
                operator: 'less_than',
                property: 'accountAge',

                value: lit(30),
              },
            ],
            value: asConfigValue(5),
          },
        ],
      };

      expect((await evaluate(config, {accountAge: 15})).finalValue).toBe(5);
      expect((await evaluate(config, {accountAge: 45})).finalValue).toBe(10);
      expect((await evaluate(config, {accountAge: 30})).finalValue).toBe(10);
    });

    it('should work with less_than_or_equal operator', async () => {
      const config: ConfigForEvaluation = {
        schema: null,
        value: 'over',
        overrides: [
          {
            name: 'Within Limit',
            conditions: [
              {
                operator: 'less_than_or_equal',
                property: 'count',

                value: lit(100),
              },
            ],
            value: asConfigValue('ok'),
          },
        ],
      };

      expect((await evaluate(config, {count: 50})).finalValue).toBe('ok');
      expect((await evaluate(config, {count: 100})).finalValue).toBe('ok');
      expect((await evaluate(config, {count: 101})).finalValue).toBe('over');
    });

    it('should work with greater_than operator', async () => {
      const config: ConfigForEvaluation = {
        schema: null,
        value: 'standard',
        overrides: [
          {
            name: 'High Credit',
            conditions: [
              {
                operator: 'greater_than',
                property: 'creditScore',

                value: lit(700),
              },
            ],
            value: asConfigValue('premium'),
          },
        ],
      };

      expect((await evaluate(config, {creditScore: 750})).finalValue).toBe('premium');
      expect((await evaluate(config, {creditScore: 650})).finalValue).toBe('standard');
      expect((await evaluate(config, {creditScore: 700})).finalValue).toBe('standard');
    });

    it('should work with greater_than_or_equal operator', async () => {
      const config: ConfigForEvaluation = {
        schema: null,
        value: 'junior',
        overrides: [
          {
            name: 'Senior',
            conditions: [
              {
                operator: 'greater_than_or_equal',
                property: 'age',

                value: lit(18),
              },
            ],
            value: asConfigValue('adult'),
          },
        ],
      };

      expect((await evaluate(config, {age: 25})).finalValue).toBe('adult');
      expect((await evaluate(config, {age: 18})).finalValue).toBe('adult');
      expect((await evaluate(config, {age: 17})).finalValue).toBe('junior');
    });
  });

  describe('Composite Operators', () => {
    it('should work with AND operator', async () => {
      const config: ConfigForEvaluation = {
        schema: null,
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

                    value: lit('vip@example.com'),
                  },
                  {
                    operator: 'equals',
                    property: 'tier',

                    value: lit('premium'),
                  },
                ],
              },
            ],
            value: asConfigValue('vip-premium'),
          },
        ],
      };

      expect(
        (await evaluate(config, {userEmail: 'vip@example.com', tier: 'premium'})).finalValue,
      ).toBe('vip-premium');
      expect(
        (await evaluate(config, {userEmail: 'vip@example.com', tier: 'free'})).finalValue,
      ).toBe('base');
    });

    it('should work with OR operator', async () => {
      const config: ConfigForEvaluation = {
        schema: null,
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

                    value: lit('admin@example.com'),
                  },
                  {
                    operator: 'equals',
                    property: 'role',

                    value: lit('admin'),
                  },
                ],
              },
            ],
            value: asConfigValue('admin-access'),
          },
        ],
      };

      expect(
        (await evaluate(config, {userEmail: 'admin@example.com', role: 'user'})).finalValue,
      ).toBe('admin-access');
      expect(
        (await evaluate(config, {userEmail: 'user@example.com', role: 'admin'})).finalValue,
      ).toBe('admin-access');
      expect(
        (await evaluate(config, {userEmail: 'user@example.com', role: 'user'})).finalValue,
      ).toBe('limited');
    });

    it('should work with NOT operator', async () => {
      const config: ConfigForEvaluation = {
        schema: null,
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

                  value: lit('banned'),
                },
              },
            ],
            value: asConfigValue('active'),
          },
        ],
      };

      expect((await evaluate(config, {status: 'active'})).finalValue).toBe('active');
      expect((await evaluate(config, {status: 'banned'})).finalValue).toBe('normal');
    });

    it('should handle nested composite rules', async () => {
      const config: ConfigForEvaluation = {
        schema: null,
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

                        value: lit('US'),
                      },
                      {
                        operator: 'equals',
                        property: 'tier',

                        value: lit('premium'),
                      },
                    ],
                  },
                  {
                    operator: 'equals',
                    property: 'userEmail',

                    value: lit('vip@example.com'),
                  },
                ],
              },
            ],
            value: asConfigValue('special'),
          },
        ],
      };

      // US premium users get special
      expect((await evaluate(config, {country: 'US', tier: 'premium'})).finalValue).toBe('special');

      // VIP users get special
      expect(
        (await evaluate(config, {userEmail: 'vip@example.com', tier: 'free'})).finalValue,
      ).toBe('special');

      // US free users don't get special
      expect((await evaluate(config, {country: 'US', tier: 'free'})).finalValue).toBe('base');

      // Non-US premium users don't get special
      expect((await evaluate(config, {country: 'UK', tier: 'premium'})).finalValue).toBe('base');
    });
  });

  describe('Multiple Conditions (Implicit AND)', () => {
    it('should require all conditions to match', async () => {
      const config: ConfigForEvaluation = {
        schema: null,
        value: 'base',
        overrides: [
          {
            name: 'VIP Premium',
            conditions: [
              {
                operator: 'equals',
                property: 'userEmail',

                value: lit('vip@example.com'),
              },
              {
                operator: 'equals',
                property: 'tier',

                value: lit('premium'),
              },
            ],
            value: asConfigValue('vip-premium'),
          },
        ],
      };

      // Both conditions match
      expect(
        (await evaluate(config, {userEmail: 'vip@example.com', tier: 'premium'})).finalValue,
      ).toBe('vip-premium');

      // Only first condition matches
      expect(
        (await evaluate(config, {userEmail: 'vip@example.com', tier: 'free'})).finalValue,
      ).toBe('base');

      // Neither condition matches
      expect(
        (await evaluate(config, {userEmail: 'user@example.com', tier: 'free'})).finalValue,
      ).toBe('base');
    });
  });

  describe('Multiple Overrides (Priority)', () => {
    it('should return first matching override', async () => {
      const config: ConfigForEvaluation = {
        schema: null,
        value: 'base',
        overrides: [
          {
            name: 'Admin',
            conditions: [
              {
                operator: 'equals',
                property: 'userEmail',

                value: lit('admin@example.com'),
              },
            ],
            value: asConfigValue('admin-override'),
          },
          {
            name: 'Premium',
            conditions: [
              {
                operator: 'equals',
                property: 'tier',

                value: lit('premium'),
              },
            ],
            value: asConfigValue('premium-override'),
          },
        ],
      };

      // First override matches
      expect(
        (await evaluate(config, {userEmail: 'admin@example.com', tier: 'premium'})).finalValue,
      ).toBe('admin-override');

      // Second override matches
      expect(
        (await evaluate(config, {userEmail: 'user@example.com', tier: 'premium'})).finalValue,
      ).toBe('premium-override');

      // No override matches
      expect(
        (await evaluate(config, {userEmail: 'user@example.com', tier: 'free'})).finalValue,
      ).toBe('base');
    });
  });

  describe('Edge Cases', () => {
    it('should return base value when no overrides defined', async () => {
      const config: ConfigForEvaluation = {
        schema: null,
        value: 'base',
        overrides: [],
      };

      expect((await evaluate(config, {userEmail: 'test@example.com'})).finalValue).toBe('base');
    });

    it('should return base value when overrides array is empty', async () => {
      const config: ConfigForEvaluation = {
        schema: null,
        value: 'base',
        overrides: [],
      };

      expect((await evaluate(config, {userEmail: 'test@example.com'})).finalValue).toBe('base');
    });

    it('should handle missing context properties', async () => {
      const config: ConfigForEvaluation = {
        schema: null,
        value: 'base',
        overrides: [
          {
            name: 'Test',
            conditions: [
              {
                operator: 'equals',
                property: 'country',

                value: lit('US'),
              },
            ],
            value: asConfigValue('override'),
          },
        ],
      };

      expect((await evaluate(config, {userEmail: 'test@example.com'})).finalValue).toBe('base');
      expect((await evaluate(config, {})).finalValue).toBe('base');
    });
  });

  describe('Debug Information', () => {
    it('should provide detailed evaluation results', async () => {
      const config: ConfigForEvaluation = {
        schema: null,
        value: 'base',
        overrides: [
          {
            name: 'Premium',
            conditions: [
              {
                operator: 'equals',
                property: 'tier',

                value: lit('premium'),
              },
            ],
            value: asConfigValue('premium-value'),
          },
        ],
      };

      const result = await evaluate(config, {tier: 'premium'});

      expect(result.finalValue).toBe('premium-value');
      // matchedOverride is now RenderedOverride, not Override;
      expect(result.overrideEvaluations).toHaveLength(1);
      expect(result.overrideEvaluations[0].result).toBe('matched');
      expect(result.overrideEvaluations[0].conditionEvaluations).toHaveLength(1);
      expect(result.overrideEvaluations[0].conditionEvaluations[0].result).toBe('matched');
    });

    it('should show why conditions failed', async () => {
      const config: ConfigForEvaluation = {
        schema: null,
        value: 'base',
        overrides: [
          {
            name: 'Premium',
            conditions: [
              {
                operator: 'equals',
                property: 'tier',

                value: lit('premium'),
              },
            ],
            value: asConfigValue('premium-value'),
          },
        ],
      };

      const result = await evaluate(config, {tier: 'free'});

      expect(result.finalValue).toBe('base');
      expect(result.matchedOverride).toBeNull();
      expect(result.overrideEvaluations[0].result).toBe('not_matched');
      expect(result.overrideEvaluations[0].conditionEvaluations[0].result).toBe('not_matched');
      expect(result.overrideEvaluations[0].conditionEvaluations[0].reason).toContain('expected');
    });

    it('should provide nested evaluation details', async () => {
      const config: ConfigForEvaluation = {
        schema: null,
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

                    value: lit('US'),
                  },
                  {
                    operator: 'equals',
                    property: 'tier',

                    value: lit('premium'),
                  },
                ],
              },
            ],
            value: asConfigValue('special'),
          },
        ],
      };

      const result = await evaluate(config, {country: 'US', tier: 'free'});

      expect(result.matchedOverride).toBeNull();
      expect(result.overrideEvaluations[0].result).toBe('not_matched');
      expect(result.overrideEvaluations[0].conditionEvaluations[0].nestedEvaluations).toHaveLength(
        2,
      );
      expect(
        result.overrideEvaluations[0].conditionEvaluations[0].nestedEvaluations![0].result,
      ).toBe('matched'); // country matches
      expect(
        result.overrideEvaluations[0].conditionEvaluations[0].nestedEvaluations![1].result,
      ).toBe('not_matched'); // tier doesn't match
    });

    it('should show type casting in debug output', async () => {
      const config: ConfigForEvaluation = {
        schema: null,
        value: 'base',
        overrides: [
          {
            name: 'Test',
            conditions: [
              {
                operator: 'equals',
                property: 'count',

                value: lit('100'), // String
              },
            ],
            value: asConfigValue('matched'),
          },
        ],
      };

      const result = await evaluate(config, {count: 100}); // Number

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

              value: lit('vip@example.com'),
            },
          ],
          value: asConfigValue({maxItems: 100}),
        },
        {
          name: 'Premium Tier',
          conditions: [
            {
              operator: 'equals',
              property: 'tier',

              value: lit('premium'),
            },
          ],
          value: asConfigValue({maxItems: 50}),
        },
      ];

      await fixture.createConfig({
        name: 'max_items_config',
        value: asConfigValue({maxItems: 10}),
        schema: null,
        overrides,
        description: 'Config with overrides',
        currentUserEmail: CURRENT_USER_EMAIL,
        editorEmails: [],
        maintainerEmails: [CURRENT_USER_EMAIL],
        projectId: fixture.projectId,
      });

      await fixture.engine.testing.replicaService.sync();

      // Test base value
      const baseResult = await fixture.engine.sdkUseCases.getConfigValue(GLOBAL_CONTEXT, {
        name: 'max_items_config',
        projectId: fixture.projectId,
        environmentId: fixture.productionEnvironmentId,
      });
      expect(baseResult.value).toEqual({maxItems: 10});

      // Test VIP user override
      const vipResult = await fixture.engine.sdkUseCases.getConfigValue(GLOBAL_CONTEXT, {
        name: 'max_items_config',
        projectId: fixture.projectId,
        environmentId: fixture.productionEnvironmentId,
        context: {userEmail: 'vip@example.com'},
      });
      expect(vipResult.value).toEqual({maxItems: 100});

      // Test premium tier override
      const premiumResult = await fixture.engine.sdkUseCases.getConfigValue(GLOBAL_CONTEXT, {
        name: 'max_items_config',
        projectId: fixture.projectId,
        environmentId: fixture.productionEnvironmentId,
        context: {userEmail: 'regular@example.com', tier: 'premium'},
      });
      expect(premiumResult.value).toEqual({maxItems: 50});

      // Test regular user (no override match)
      const regularResult = await fixture.engine.sdkUseCases.getConfigValue(GLOBAL_CONTEXT, {
        name: 'max_items_config',
        projectId: fixture.projectId,
        environmentId: fixture.productionEnvironmentId,
        context: {userEmail: 'regular@example.com', tier: 'free'},
      });
      expect(regularResult.value).toEqual({maxItems: 10});
    });

    it('should update overrides via updateConfig', async () => {
      const {configId} = await fixture.createConfig({
        name: 'feature_flag',
        value: false,
        schema: null,
        overrides: [],
        description: 'Feature flag',
        currentUserEmail: CURRENT_USER_EMAIL,
        editorEmails: [],
        maintainerEmails: [CURRENT_USER_EMAIL],
        projectId: fixture.projectId,
      });

      // Get the production variant
      const variants = await fixture.engine.testing.configVariants.getByConfigId(configId);
      const productionVariant = variants.find(
        v => v.environmentId === fixture.productionEnvironmentId,
      );
      assert(productionVariant, 'Production variant should exist');

      const newOverrides: Override[] = [
        {
          name: 'Enabled Users',
          conditions: [
            {
              operator: 'equals',
              property: 'enabled',

              value: lit(true),
            },
          ],
          value: asConfigValue(true),
        },
      ];

      await fixture.engine.useCases.updateConfig(GLOBAL_CONTEXT, {
        configId,
        description: 'Feature flag',
        editorEmails: [],
        maintainerEmails: [CURRENT_USER_EMAIL],
        defaultVariant: {value: asConfigValue(false), schema: null, overrides: []},
        environmentVariants: [
          {
            environmentId: fixture.productionEnvironmentId,
            value: asConfigValue(false),
            schema: null,
            useDefaultSchema: false,
            overrides: newOverrides,
          },
          {
            environmentId: fixture.developmentEnvironmentId,
            value: asConfigValue(false),
            schema: null,
            useDefaultSchema: false,
            overrides: [],
          },
        ],
        currentUserEmail: CURRENT_USER_EMAIL,
        prevVersion: 1,
      });

      await fixture.engine.testing.replicaService.sync();

      // Verify override works
      const enabledResult = await fixture.engine.sdkUseCases.getConfigValue(GLOBAL_CONTEXT, {
        name: 'feature_flag',
        projectId: fixture.projectId,
        environmentId: fixture.productionEnvironmentId,
        context: {enabled: true},
      });
      expect(enabledResult.value).toBe(true);

      const disabledResult = await fixture.engine.sdkUseCases.getConfigValue(GLOBAL_CONTEXT, {
        name: 'feature_flag',
        projectId: fixture.projectId,
        environmentId: fixture.productionEnvironmentId,
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

              value: lit('18'), // String in rule
            },
          ],
          value: asConfigValue({access: 'adult'}),
        },
      ];

      await fixture.createConfig({
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

      await fixture.engine.testing.replicaService.sync();

      // Number context should work with string rule
      const adult = await fixture.engine.sdkUseCases.getConfigValue(GLOBAL_CONTEXT, {
        name: 'age_restricted',
        projectId: fixture.projectId,
        environmentId: fixture.productionEnvironmentId,
        context: {age: 25},
      });
      expect(adult.value).toEqual({access: 'adult'});

      const minor = await fixture.engine.sdkUseCases.getConfigValue(GLOBAL_CONTEXT, {
        name: 'age_restricted',
        projectId: fixture.projectId,
        environmentId: fixture.productionEnvironmentId,
        context: {age: 15},
      });
      expect(minor.value).toEqual({access: 'child'});
    });
  });
});
