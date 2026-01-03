import {describe, expect, it} from 'vitest';
import type {Condition, Override} from './override-condition-schemas';
import {stringifyJsonc} from './utils';
import {
  extractConditionReferences,
  extractOverrideReferences,
  validateOverrideReferences,
} from './validate-override-references';
import {ConfigValue} from './zod';

function asConfigValue(value: unknown): ConfigValue {
  return stringifyJsonc(value) as ConfigValue;
}

describe('extractReferences', () => {
  describe('equals condition', () => {
    it('should extract reference from equals condition with reference value', () => {
      const condition: Condition = {
        operator: 'equals',
        property: 'userId',
        value: {
          type: 'reference',
          projectId: 'proj-123',
          configName: 'other-config',
          path: ['users', 0, 'id'],
        },
      };

      const references = extractConditionReferences(condition);

      expect(references).toEqual([
        {
          projectId: 'proj-123',
          configName: 'other-config',
          path: ['users', 0, 'id'],
        },
      ]);
    });

    it('should return empty array for equals condition with literal value', () => {
      const condition: Condition = {
        operator: 'equals',
        property: 'userId',
        value: {
          type: 'literal',
          value: asConfigValue('user-123'),
        },
      };

      const references = extractConditionReferences(condition);

      expect(references).toEqual([]);
    });
  });

  describe('comparison conditions', () => {
    it('should extract reference from in condition', () => {
      const condition: Condition = {
        operator: 'in',
        property: 'region',
        value: {
          type: 'reference',
          projectId: 'proj-456',
          configName: 'regions-config',
          path: ['allowed'],
        },
      };

      const references = extractConditionReferences(condition);

      expect(references).toEqual([
        {
          projectId: 'proj-456',
          configName: 'regions-config',
          path: ['allowed'],
        },
      ]);
    });

    it('should extract reference from not_in condition', () => {
      const condition: Condition = {
        operator: 'not_in',
        property: 'status',
        value: {
          type: 'reference',
          projectId: 'proj-789',
          configName: 'blocked-statuses',
          path: [],
        },
      };

      const references = extractConditionReferences(condition);

      expect(references).toEqual([
        {
          projectId: 'proj-789',
          configName: 'blocked-statuses',
          path: [],
        },
      ]);
    });

    it('should extract reference from less_than condition', () => {
      const condition: Condition = {
        operator: 'less_than',
        property: 'age',
        value: {
          type: 'reference',
          projectId: 'proj-abc',
          configName: 'thresholds',
          path: ['maxAge'],
        },
      };

      const references = extractConditionReferences(condition);

      expect(references).toEqual([
        {
          projectId: 'proj-abc',
          configName: 'thresholds',
          path: ['maxAge'],
        },
      ]);
    });

    it('should extract reference from less_than_or_equal condition', () => {
      const condition: Condition = {
        operator: 'less_than_or_equal',
        property: 'score',
        value: {
          type: 'reference',
          projectId: 'proj-def',
          configName: 'limits',
          path: ['max'],
        },
      };

      const references = extractConditionReferences(condition);

      expect(references).toEqual([
        {
          projectId: 'proj-def',
          configName: 'limits',
          path: ['max'],
        },
      ]);
    });

    it('should extract reference from greater_than condition', () => {
      const condition: Condition = {
        operator: 'greater_than',
        property: 'balance',
        value: {
          type: 'reference',
          projectId: 'proj-ghi',
          configName: 'minimums',
          path: ['required', 'balance'],
        },
      };

      const references = extractConditionReferences(condition);

      expect(references).toEqual([
        {
          projectId: 'proj-ghi',
          configName: 'minimums',
          path: ['required', 'balance'],
        },
      ]);
    });

    it('should extract reference from greater_than_or_equal condition', () => {
      const condition: Condition = {
        operator: 'greater_than_or_equal',
        property: 'level',
        value: {
          type: 'reference',
          projectId: 'proj-jkl',
          configName: 'requirements',
          path: ['minLevel'],
        },
      };

      const references = extractConditionReferences(condition);

      expect(references).toEqual([
        {
          projectId: 'proj-jkl',
          configName: 'requirements',
          path: ['minLevel'],
        },
      ]);
    });
  });

  describe('segmentation condition', () => {
    it('should return empty array for segmentation condition', () => {
      const condition: Condition = {
        operator: 'segmentation',
        property: 'userId',
        fromPercentage: 0,
        toPercentage: 50,
        seed: 'test-seed',
      };

      const references = extractConditionReferences(condition);

      expect(references).toEqual([]);
    });
  });

  describe('composite conditions', () => {
    it('should extract references from and condition', () => {
      const condition: Condition = {
        operator: 'and',
        conditions: [
          {
            operator: 'equals',
            property: 'region',
            value: {
              type: 'reference',
              projectId: 'proj-1',
              configName: 'config-a',
              path: ['region'],
            },
          },
          {
            operator: 'greater_than',
            property: 'age',
            value: {
              type: 'reference',
              projectId: 'proj-2',
              configName: 'config-b',
              path: ['minAge'],
            },
          },
        ],
      };

      const references = extractConditionReferences(condition);

      expect(references).toEqual([
        {projectId: 'proj-1', configName: 'config-a', path: ['region']},
        {projectId: 'proj-2', configName: 'config-b', path: ['minAge']},
      ]);
    });

    it('should extract references from or condition', () => {
      const condition: Condition = {
        operator: 'or',
        conditions: [
          {
            operator: 'in',
            property: 'country',
            value: {
              type: 'reference',
              projectId: 'proj-x',
              configName: 'countries',
              path: ['allowed'],
            },
          },
          {
            operator: 'equals',
            property: 'isPremium',
            value: {
              type: 'literal',
              value: stringifyJsonc(true) as ConfigValue,
            },
          },
        ],
      };

      const references = extractConditionReferences(condition);

      expect(references).toEqual([
        {projectId: 'proj-x', configName: 'countries', path: ['allowed']},
      ]);
    });

    it('should extract references from not condition', () => {
      const condition: Condition = {
        operator: 'not',
        condition: {
          operator: 'equals',
          property: 'status',
          value: {
            type: 'reference',
            projectId: 'proj-y',
            configName: 'blocked',
            path: ['status'],
          },
        },
      };

      const references = extractConditionReferences(condition);

      expect(references).toEqual([{projectId: 'proj-y', configName: 'blocked', path: ['status']}]);
    });

    it('should extract references from deeply nested conditions', () => {
      const condition: Condition = {
        operator: 'and',
        conditions: [
          {
            operator: 'or',
            conditions: [
              {
                operator: 'not',
                condition: {
                  operator: 'equals',
                  property: 'a',
                  value: {
                    type: 'reference',
                    projectId: 'proj-deep-1',
                    configName: 'config-1',
                    path: ['nested', 'path'],
                  },
                },
              },
              {
                operator: 'in',
                property: 'b',
                value: {
                  type: 'reference',
                  projectId: 'proj-deep-2',
                  configName: 'config-2',
                  path: [],
                },
              },
            ],
          },
          {
            operator: 'segmentation',
            property: 'userId',
            fromPercentage: 0,
            toPercentage: 10,
            seed: 'seed',
          },
          {
            operator: 'greater_than',
            property: 'c',
            value: {
              type: 'literal',
              value: asConfigValue(100),
            },
          },
        ],
      };

      const references = extractConditionReferences(condition);

      expect(references).toEqual([
        {projectId: 'proj-deep-1', configName: 'config-1', path: ['nested', 'path']},
        {projectId: 'proj-deep-2', configName: 'config-2', path: []},
      ]);
    });

    it('should handle empty and condition', () => {
      const condition: Condition = {
        operator: 'and',
        conditions: [],
      };

      const references = extractConditionReferences(condition);

      expect(references).toEqual([]);
    });

    it('should handle empty or condition', () => {
      const condition: Condition = {
        operator: 'or',
        conditions: [],
      };

      const references = extractConditionReferences(condition);

      expect(references).toEqual([]);
    });
  });

  describe('path handling', () => {
    it('should preserve path with mixed string and number indices', () => {
      const condition: Condition = {
        operator: 'equals',
        property: 'value',
        value: {
          type: 'reference',
          projectId: 'proj-path',
          configName: 'array-config',
          path: ['items', 0, 'nested', 1, 'deep'],
        },
      };

      const references = extractConditionReferences(condition);

      expect(references[0].path).toEqual(['items', 0, 'nested', 1, 'deep']);
    });

    it('should handle empty path', () => {
      const condition: Condition = {
        operator: 'equals',
        property: 'value',
        value: {
          type: 'reference',
          projectId: 'proj-root',
          configName: 'root-config',
          path: [],
        },
      };

      const references = extractConditionReferences(condition);

      expect(references[0].path).toEqual([]);
    });
  });
});

describe('extractOverrideReferences', () => {
  it('should extract references from all conditions in an override', () => {
    const override: Override = {
      name: 'multi-condition-override',
      conditions: [
        {
          operator: 'equals',
          property: 'region',
          value: {
            type: 'reference',
            projectId: 'proj-1',
            configName: 'config-a',
            path: ['region'],
          },
        },
        {
          operator: 'greater_than',
          property: 'age',
          value: {
            type: 'reference',
            projectId: 'proj-2',
            configName: 'config-b',
            path: ['minAge'],
          },
        },
      ],
      value: asConfigValue({enabled: true}),
    };

    const references = extractOverrideReferences(override);

    expect(references).toEqual([
      {projectId: 'proj-1', configName: 'config-a', path: ['region']},
      {projectId: 'proj-2', configName: 'config-b', path: ['minAge']},
    ]);
  });

  it('should return empty array when override has no conditions', () => {
    const override: Override = {
      name: 'empty-conditions',
      conditions: [],
      value: asConfigValue({enabled: true}),
    };

    const references = extractOverrideReferences(override);

    expect(references).toEqual([]);
  });

  it('should return empty array when all conditions have literal values', () => {
    const override: Override = {
      name: 'literal-only',
      conditions: [
        {
          operator: 'equals',
          property: 'userId',
          value: {
            type: 'literal',
            value: asConfigValue('user-123'),
          },
        },
        {
          operator: 'in',
          property: 'status',
          value: {
            type: 'literal',
            value: asConfigValue(['active', 'pending']),
          },
        },
      ],
      value: asConfigValue({feature: true}),
    };

    const references = extractOverrideReferences(override);

    expect(references).toEqual([]);
  });

  it('should extract references from nested conditions within multiple top-level conditions', () => {
    const override: Override = {
      name: 'nested-override',
      conditions: [
        {
          operator: 'and',
          conditions: [
            {
              operator: 'equals',
              property: 'a',
              value: {
                type: 'reference',
                projectId: 'proj-nested-1',
                configName: 'nested-config-1',
                path: ['a'],
              },
            },
            {
              operator: 'or',
              conditions: [
                {
                  operator: 'equals',
                  property: 'b',
                  value: {
                    type: 'reference',
                    projectId: 'proj-nested-2',
                    configName: 'nested-config-2',
                    path: ['b'],
                  },
                },
              ],
            },
          ],
        },
        {
          operator: 'not',
          condition: {
            operator: 'in',
            property: 'c',
            value: {
              type: 'reference',
              projectId: 'proj-nested-3',
              configName: 'nested-config-3',
              path: ['c'],
            },
          },
        },
      ],
      value: asConfigValue({}),
    };

    const references = extractOverrideReferences(override);

    expect(references).toEqual([
      {projectId: 'proj-nested-1', configName: 'nested-config-1', path: ['a']},
      {projectId: 'proj-nested-2', configName: 'nested-config-2', path: ['b']},
      {projectId: 'proj-nested-3', configName: 'nested-config-3', path: ['c']},
    ]);
  });

  it('should extract mixed references and ignore literals', () => {
    const override: Override = {
      name: 'mixed-override',
      conditions: [
        {
          operator: 'equals',
          property: 'ref1',
          value: {
            type: 'reference',
            projectId: 'proj-ref',
            configName: 'ref-config',
            path: ['path'],
          },
        },
        {
          operator: 'equals',
          property: 'literal1',
          value: {
            type: 'literal',
            value: asConfigValue('literal-value'),
          },
        },
        {
          operator: 'segmentation',
          property: 'userId',
          fromPercentage: 0,
          toPercentage: 50,
          seed: 'seed',
        },
      ],
      value: asConfigValue({}),
    };

    const references = extractOverrideReferences(override);

    expect(references).toEqual([{projectId: 'proj-ref', configName: 'ref-config', path: ['path']}]);
  });

  it('should handle single condition with reference', () => {
    const override: Override = {
      name: 'single-ref',
      conditions: [
        {
          operator: 'equals',
          property: 'feature',
          value: {
            type: 'reference',
            projectId: 'proj-single',
            configName: 'single-config',
            path: ['enabled'],
          },
        },
      ],
      value: asConfigValue({enabled: true}),
    };

    const references = extractOverrideReferences(override);

    expect(references).toEqual([
      {projectId: 'proj-single', configName: 'single-config', path: ['enabled']},
    ]);
  });

  it('should handle segmentation-only conditions', () => {
    const override: Override = {
      name: 'segmentation-only',
      conditions: [
        {
          operator: 'segmentation',
          property: 'userId',
          fromPercentage: 0,
          toPercentage: 10,
          seed: 'experiment-1',
        },
        {
          operator: 'segmentation',
          property: 'deviceId',
          fromPercentage: 50,
          toPercentage: 100,
          seed: 'experiment-2',
        },
      ],
      value: asConfigValue({variant: 'control'}),
    };

    const references = extractOverrideReferences(override);

    expect(references).toEqual([]);
  });

  it('should preserve path with mixed indices', () => {
    const override: Override = {
      name: 'path-test',
      conditions: [
        {
          operator: 'equals',
          property: 'test',
          value: {
            type: 'reference',
            projectId: 'proj-path',
            configName: 'path-config',
            path: ['items', 0, 'nested', 1, 'value'],
          },
        },
      ],
      value: asConfigValue({}),
    };

    const references = extractOverrideReferences(override);

    expect(references[0].path).toEqual(['items', 0, 'nested', 1, 'value']);
  });
});

describe('validateOverrideReferences', () => {
  const configProjectId = 'current-project-id';

  describe('with valid references', () => {
    it('should not throw when all references use the same project ID', () => {
      const overrides: Override[] = [
        {
          name: 'override-1',
          conditions: [
            {
              operator: 'equals',
              property: 'feature',
              value: {
                type: 'reference',
                projectId: configProjectId,
                configName: 'other-config',
                path: ['enabled'],
              },
            },
          ],
          value: asConfigValue({enabled: true}),
        },
      ];

      expect(() =>
        validateOverrideReferences({
          overrides,
          configProjectId,
        }),
      ).not.toThrow();
    });

    it('should not throw when overrides have only literal values', () => {
      const overrides: Override[] = [
        {
          name: 'literal-override',
          conditions: [
            {
              operator: 'equals',
              property: 'userId',
              value: {
                type: 'literal',
                value: asConfigValue('user-123'),
              },
            },
          ],
          value: asConfigValue({feature: true}),
        },
      ];

      expect(() =>
        validateOverrideReferences({
          overrides,
          configProjectId,
        }),
      ).not.toThrow();
    });

    it('should not throw when overrides is null', () => {
      expect(() =>
        validateOverrideReferences({
          overrides: null,
          configProjectId,
        }),
      ).not.toThrow();
    });

    it('should not throw when overrides is undefined', () => {
      expect(() =>
        validateOverrideReferences({
          overrides: undefined,
          configProjectId,
        }),
      ).not.toThrow();
    });

    it('should not throw when overrides is empty array', () => {
      expect(() =>
        validateOverrideReferences({
          overrides: [],
          configProjectId,
        }),
      ).not.toThrow();
    });

    it('should not throw when multiple references all use the same project ID', () => {
      const overrides: Override[] = [
        {
          name: 'multi-ref-override',
          conditions: [
            {
              operator: 'and',
              conditions: [
                {
                  operator: 'equals',
                  property: 'a',
                  value: {
                    type: 'reference',
                    projectId: configProjectId,
                    configName: 'config-a',
                    path: ['a'],
                  },
                },
                {
                  operator: 'in',
                  property: 'b',
                  value: {
                    type: 'reference',
                    projectId: configProjectId,
                    configName: 'config-b',
                    path: ['b'],
                  },
                },
              ],
            },
          ],
          value: asConfigValue({result: true}),
        },
      ];

      expect(() =>
        validateOverrideReferences({
          overrides,
          configProjectId,
        }),
      ).not.toThrow();
    });
  });

  describe('with invalid references', () => {
    it('should throw when a reference uses a different project ID', () => {
      const overrides: Override[] = [
        {
          name: 'cross-project-override',
          conditions: [
            {
              operator: 'equals',
              property: 'feature',
              value: {
                type: 'reference',
                projectId: 'different-project-id',
                configName: 'other-config',
                path: ['enabled'],
              },
            },
          ],
          value: asConfigValue({enabled: true}),
        },
      ];

      expect(() =>
        validateOverrideReferences({
          overrides,
          configProjectId,
        }),
      ).toThrow(/Override references must use the same project ID/);
    });

    it('should include override name in error message', () => {
      const overrides: Override[] = [
        {
          name: 'my-specific-override',
          conditions: [
            {
              operator: 'equals',
              property: 'test',
              value: {
                type: 'reference',
                projectId: 'wrong-project',
                configName: 'some-config',
                path: [],
              },
            },
          ],
          value: asConfigValue({}),
        },
      ];

      expect(() =>
        validateOverrideReferences({
          overrides,
          configProjectId,
        }),
      ).toThrow(/my-specific-override/);
    });

    it('should include referenced project ID in error message', () => {
      const wrongProjectId = 'wrong-project-xyz';
      const overrides: Override[] = [
        {
          name: 'test-override',
          conditions: [
            {
              operator: 'equals',
              property: 'test',
              value: {
                type: 'reference',
                projectId: wrongProjectId,
                configName: 'some-config',
                path: [],
              },
            },
          ],
          value: asConfigValue({}),
        },
      ];

      expect(() =>
        validateOverrideReferences({
          overrides,
          configProjectId,
        }),
      ).toThrow(new RegExp(wrongProjectId));
    });

    it('should detect invalid references in nested conditions', () => {
      const overrides: Override[] = [
        {
          name: 'nested-invalid',
          conditions: [
            {
              operator: 'and',
              conditions: [
                {
                  operator: 'or',
                  conditions: [
                    {
                      operator: 'not',
                      condition: {
                        operator: 'equals',
                        property: 'deep',
                        value: {
                          type: 'reference',
                          projectId: 'deeply-nested-wrong-project',
                          configName: 'deep-config',
                          path: ['nested'],
                        },
                      },
                    },
                  ],
                },
              ],
            },
          ],
          value: asConfigValue({}),
        },
      ];

      expect(() =>
        validateOverrideReferences({
          overrides,
          configProjectId,
        }),
      ).toThrow(/nested-invalid/);
    });

    it('should detect multiple invalid references across multiple overrides', () => {
      const overrides: Override[] = [
        {
          name: 'first-override',
          conditions: [
            {
              operator: 'equals',
              property: 'a',
              value: {
                type: 'reference',
                projectId: 'wrong-1',
                configName: 'config-1',
                path: [],
              },
            },
          ],
          value: asConfigValue({}),
        },
        {
          name: 'second-override',
          conditions: [
            {
              operator: 'in',
              property: 'b',
              value: {
                type: 'reference',
                projectId: 'wrong-2',
                configName: 'config-2',
                path: [],
              },
            },
          ],
          value: asConfigValue({}),
        },
      ];

      expect(() =>
        validateOverrideReferences({
          overrides,
          configProjectId,
        }),
      ).toThrow(/first-override.*second-override|second-override.*first-override/);
    });

    it('should throw BadRequestError', () => {
      const overrides: Override[] = [
        {
          name: 'bad-override',
          conditions: [
            {
              operator: 'equals',
              property: 'test',
              value: {
                type: 'reference',
                projectId: 'bad-project',
                configName: 'bad-config',
                path: [],
              },
            },
          ],
          value: asConfigValue({}),
        },
      ];

      try {
        validateOverrideReferences({
          overrides,
          configProjectId,
        });
        expect.fail('Should have thrown');
      } catch (error: any) {
        expect(error.name).toBe('BadRequestError');
      }
    });
  });

  describe('mixed valid and invalid references', () => {
    it('should throw when some references are valid and some are invalid', () => {
      const overrides: Override[] = [
        {
          name: 'mixed-override',
          conditions: [
            {
              operator: 'and',
              conditions: [
                {
                  operator: 'equals',
                  property: 'valid',
                  value: {
                    type: 'reference',
                    projectId: configProjectId,
                    configName: 'valid-config',
                    path: [],
                  },
                },
                {
                  operator: 'equals',
                  property: 'invalid',
                  value: {
                    type: 'reference',
                    projectId: 'different-project',
                    configName: 'invalid-config',
                    path: [],
                  },
                },
              ],
            },
          ],
          value: asConfigValue({}),
        },
      ];

      expect(() =>
        validateOverrideReferences({
          overrides,
          configProjectId,
        }),
      ).toThrow();
    });
  });
});
