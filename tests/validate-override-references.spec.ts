import {stringifyJsonc} from '@/engine/core/utils';
import type {ConfigSchema, ConfigValue} from '@/engine/core/zod';
import {describe, expect, it} from 'vitest';
import {BadRequestError} from '../src/engine/core/errors';
import type {Override} from '../src/engine/core/override-condition-schemas';
import {validateOverrideReferences} from '../src/engine/core/validate-override-references';

function asConfigValue(value: unknown): ConfigValue {
  return stringifyJsonc(value) as ConfigValue;
}

function asConfigSchema(value: unknown): ConfigSchema {
  return stringifyJsonc(value) as ConfigSchema;
}

describe('validateOverrideReferences', () => {
  const projectId = 'project-123';

  it('should pass when no overrides are provided', () => {
    expect(() =>
      validateOverrideReferences({
        overrides: null,
        configProjectId: projectId,
      }),
    ).not.toThrow();

    expect(() =>
      validateOverrideReferences({
        overrides: undefined,
        configProjectId: projectId,
      }),
    ).not.toThrow();

    expect(() =>
      validateOverrideReferences({
        overrides: [],
        configProjectId: projectId,
      }),
    ).not.toThrow();
  });

  it('should pass when overrides have no references', () => {
    const overrides: Override[] = [
      {
        name: 'Premium Users',
        conditions: [
          {
            operator: 'equals',
            property: 'plan',
            value: {type: 'literal', value: asConfigValue('premium')},
          },
        ],
        value: asConfigValue(true),
      },
    ];

    expect(() =>
      validateOverrideReferences({
        overrides,
        configProjectId: projectId,
      }),
    ).not.toThrow();
  });

  it('should pass when reference uses same project ID', () => {
    const overrides: Override[] = [
      {
        name: 'VIP Users',
        conditions: [
          {
            operator: 'in',
            property: 'userId',
            value: {
              type: 'reference',
              projectId: projectId, // same as config
              configName: 'vip-user-list',
              path: ['users'],
            },
          },
        ],
        value: asConfigValue(1000),
      },
    ];

    expect(() =>
      validateOverrideReferences({
        overrides,
        configProjectId: projectId,
      }),
    ).not.toThrow();
  });

  it('should throw when reference uses different project ID', () => {
    const overrides: Override[] = [
      {
        name: 'VIP Users',
        conditions: [
          {
            operator: 'in',
            property: 'userId',
            value: {
              type: 'reference',
              projectId: 'different-project', // different from config
              configName: 'vip-user-list',
              path: ['users'],
            },
          },
        ],
        value: asConfigValue(1000),
      },
    ];

    expect(() =>
      validateOverrideReferences({
        overrides,
        configProjectId: projectId,
      }),
    ).toThrow(BadRequestError);

    try {
      validateOverrideReferences({
        overrides,
        configProjectId: projectId,
      });
    } catch (e) {
      expect(e).toBeInstanceOf(BadRequestError);
      expect((e as BadRequestError).message).toContain('VIP Users');
      expect((e as BadRequestError).message).toContain('different-project');
    }
  });

  it('should throw when nested condition has different project ID', () => {
    const overrides: Override[] = [
      {
        name: 'Complex Rule',
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
                  projectId: 'wrong-project',
                  configName: 'user-list',
                  path: ['ids'],
                },
              },
            ],
          },
        ],
        value: asConfigValue(true),
      },
    ];

    expect(() =>
      validateOverrideReferences({
        overrides,
        configProjectId: projectId,
      }),
    ).toThrow(BadRequestError);
  });

  it('should handle NOT conditions', () => {
    const overrides: Override[] = [
      {
        name: 'Not Rule',
        conditions: [
          {
            operator: 'not',
            condition: {
              operator: 'in',
              property: 'userId',
              value: {
                type: 'reference',
                projectId: 'wrong-project',
                configName: 'blocked-users',
                path: ['users'],
              },
            },
          },
        ],
        value: asConfigValue(true),
      },
    ];

    expect(() =>
      validateOverrideReferences({
        overrides,
        configProjectId: projectId,
      }),
    ).toThrow(BadRequestError);
  });

  it('should detect multiple invalid references', () => {
    const overrides: Override[] = [
      {
        name: 'First Override',
        conditions: [
          {
            operator: 'in',
            property: 'userId',
            value: {
              type: 'reference',
              projectId: 'project-A',
              configName: 'list-a',
              path: ['items'],
            },
          },
        ],
        value: asConfigValue(1),
      },
      {
        name: 'Second Override',
        conditions: [
          {
            operator: 'equals',
            property: 'flag',
            value: {
              type: 'reference',
              projectId: 'project-B',
              configName: 'flag-value',
              path: ['value'],
            },
          },
        ],
        value: asConfigValue(2),
      },
    ];

    try {
      validateOverrideReferences({
        overrides,
        configProjectId: projectId,
      });
      expect.fail('Should have thrown');
    } catch (e) {
      expect(e).toBeInstanceOf(BadRequestError);
      const message = (e as BadRequestError).message;
      expect(message).toContain('First Override');
      expect(message).toContain('Second Override');
      expect(message).toContain('project-A');
      expect(message).toContain('project-B');
    }
  });

  it('should pass with segmentation conditions (no references)', () => {
    const overrides: Override[] = [
      {
        name: 'A/B Test',
        conditions: [
          {
            operator: 'segmentation',
            property: 'userId',
            fromPercentage: 0,
            toPercentage: 50,
            seed: 'experiment-1',
          },
        ],
        value: asConfigValue('b'),
      },
    ];

    expect(() =>
      validateOverrideReferences({
        overrides,
        configProjectId: projectId,
      }),
    ).not.toThrow();
  });

  it('should pass with OR conditions when all references are valid', () => {
    const overrides: Override[] = [
      {
        name: 'Multiple Lists',
        conditions: [
          {
            operator: 'or',
            conditions: [
              {
                operator: 'in',
                property: 'userId',
                value: {
                  type: 'reference',
                  projectId: projectId, // correct
                  configName: 'vip-users',
                  path: ['users'],
                },
              },
              {
                operator: 'in',
                property: 'userId',
                value: {
                  type: 'reference',
                  projectId: projectId, // correct
                  configName: 'beta-testers',
                  path: ['users'],
                },
              },
            ],
          },
        ],
        value: asConfigValue(true),
      },
    ];

    expect(() =>
      validateOverrideReferences({
        overrides,
        configProjectId: projectId,
      }),
    ).not.toThrow();
  });
});
