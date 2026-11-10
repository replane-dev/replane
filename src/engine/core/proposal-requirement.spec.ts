import {describe, expect, it} from 'vitest';
import {
  getProtectedEnvironmentsAffectedByBaseConfig,
  isProposalRequired,
  type ProposalRequirementParams,
} from './proposal-requirement';
import type {ConfigSchema, ConfigValue} from './zod';

function json(value: unknown, space?: number): ConfigValue {
  return JSON.stringify(value, null, space) as ConfigValue;
}

function jsonSchema(value: unknown, space?: number): ConfigSchema {
  return JSON.stringify(value, null, space) as ConfigSchema;
}

describe('proposal-requirement', () => {
  // Helper to create base params
  function createBaseParams(
    overrides: Partial<ProposalRequirementParams> = {},
  ): ProposalRequirementParams {
    return {
      projectRequiresProposals: true,
      environments: [
        {id: 'prod', requireProposals: true},
        {id: 'dev', requireProposals: false},
      ],
      current: {
        defaultVariant: {
          value: json({key: 'value'}),
          schema: null,
          overrides: [],
        },
        environmentVariants: [],
        editorEmails: [],
        maintainerEmails: ['maintainer@example.com'],
      },
      proposed: {
        defaultVariant: {
          value: json({key: 'value'}),
          schema: null,
          overrides: [],
        },
        environmentVariants: [],
        editorEmails: [],
        maintainerEmails: ['maintainer@example.com'],
      },
      ...overrides,
    };
  }

  describe('getProtectedEnvironmentsAffectedByBaseConfig', () => {
    it('should return environments that require proposals and have no override', () => {
      const result = getProtectedEnvironmentsAffectedByBaseConfig({
        environments: [
          {id: 'prod', requireProposals: true},
          {id: 'staging', requireProposals: true},
          {id: 'dev', requireProposals: false},
        ],
        environmentVariants: [],
      });

      expect(result).toEqual(['prod', 'staging']);
    });

    it('should exclude environments that have an override', () => {
      const result = getProtectedEnvironmentsAffectedByBaseConfig({
        environments: [
          {id: 'prod', requireProposals: true},
          {id: 'staging', requireProposals: true},
          {id: 'dev', requireProposals: false},
        ],
        environmentVariants: [{environmentId: 'prod'}],
      });

      expect(result).toEqual(['staging']);
    });

    it('should return empty array when all protected environments have overrides', () => {
      const result = getProtectedEnvironmentsAffectedByBaseConfig({
        environments: [
          {id: 'prod', requireProposals: true},
          {id: 'staging', requireProposals: true},
        ],
        environmentVariants: [{environmentId: 'prod'}, {environmentId: 'staging'}],
      });

      expect(result).toEqual([]);
    });

    it('should return empty array when no environments require proposals', () => {
      const result = getProtectedEnvironmentsAffectedByBaseConfig({
        environments: [
          {id: 'prod', requireProposals: false},
          {id: 'dev', requireProposals: false},
        ],
        environmentVariants: [],
      });

      expect(result).toEqual([]);
    });

    it('should handle empty environments array', () => {
      const result = getProtectedEnvironmentsAffectedByBaseConfig({
        environments: [],
        environmentVariants: [],
      });

      expect(result).toEqual([]);
    });
  });

  describe('isProposalRequired', () => {
    describe('when project does not require proposals', () => {
      it('should return required: false', () => {
        const params = createBaseParams({
          projectRequiresProposals: false,
        });

        const result = isProposalRequired(params);

        expect(result).toEqual({required: false});
      });

      it('should return required: false even if values change', () => {
        const params = createBaseParams({
          projectRequiresProposals: false,
          proposed: {
            defaultVariant: {
              value: json({key: 'different'}),
              schema: null,
              overrides: [],
            },
            environmentVariants: [],
            editorEmails: [],
            maintainerEmails: ['maintainer@example.com'],
          },
        });

        const result = isProposalRequired(params);

        expect(result).toEqual({required: false});
      });
    });

    describe('when members change', () => {
      it('should require proposal when editor is added', () => {
        const params = createBaseParams({
          proposed: {
            defaultVariant: {
              value: json({key: 'value'}),
              schema: null,
              overrides: [],
            },
            environmentVariants: [],
            editorEmails: ['new-editor@example.com'],
            maintainerEmails: ['maintainer@example.com'],
          },
        });

        const result = isProposalRequired(params);

        expect(result.required).toBe(true);
        expect(result.reason).toBe('Config members changed');
        expect(result.affectedEnvironmentIds).toEqual(['prod', 'dev']);
      });

      it('should require proposal when maintainer is removed', () => {
        const params = createBaseParams({
          proposed: {
            defaultVariant: {
              value: json({key: 'value'}),
              schema: null,
              overrides: [],
            },
            environmentVariants: [],
            editorEmails: [],
            maintainerEmails: [],
          },
        });

        const result = isProposalRequired(params);

        expect(result.required).toBe(true);
        expect(result.reason).toBe('Config members changed');
      });

      it('should not require proposal when member order changes but content is same', () => {
        const params = createBaseParams({
          current: {
            defaultVariant: {
              value: json({key: 'value'}),
              schema: null,
              overrides: [],
            },
            environmentVariants: [],
            editorEmails: ['b@example.com', 'a@example.com'],
            maintainerEmails: ['maintainer@example.com'],
          },
          proposed: {
            defaultVariant: {
              value: json({key: 'value'}),
              schema: null,
              overrides: [],
            },
            environmentVariants: [],
            editorEmails: ['a@example.com', 'b@example.com'],
            maintainerEmails: ['maintainer@example.com'],
          },
        });

        const result = isProposalRequired(params);

        expect(result.required).toBe(false);
      });
    });

    describe('when default variant changes', () => {
      it('should require proposal when default value changes and affects protected environment', () => {
        const params = createBaseParams({
          proposed: {
            defaultVariant: {
              value: json({key: 'changed'}),
              schema: null,
              overrides: [],
            },
            environmentVariants: [],
            editorEmails: [],
            maintainerEmails: ['maintainer@example.com'],
          },
        });

        const result = isProposalRequired(params);

        expect(result.required).toBe(true);
        expect(result.reason).toBe('Default value changed');
        expect(result.affectedEnvironmentIds).toEqual(['prod']);
      });

      it('should require proposal when default schema changes', () => {
        const params = createBaseParams({
          proposed: {
            defaultVariant: {
              value: json({key: 'value'}),
              schema: jsonSchema({type: 'object'}),
              overrides: [],
            },
            environmentVariants: [],
            editorEmails: [],
            maintainerEmails: ['maintainer@example.com'],
          },
        });

        const result = isProposalRequired(params);

        expect(result.required).toBe(true);
        expect(result.reason).toBe('Default value changed');
      });

      it('should require proposal when default overrides change', () => {
        const params = createBaseParams({
          proposed: {
            defaultVariant: {
              value: json({key: 'value'}),
              schema: null,
              overrides: [{name: 'override', conditions: [], value: json('override')}],
            },
            environmentVariants: [],
            editorEmails: [],
            maintainerEmails: ['maintainer@example.com'],
          },
        });

        const result = isProposalRequired(params);

        expect(result.required).toBe(true);
        expect(result.reason).toBe('Default value changed');
      });

      it('should NOT require proposal when default value changes but protected env has override', () => {
        const params = createBaseParams({
          current: {
            defaultVariant: {
              value: json({key: 'value'}),
              schema: null,
              overrides: [],
            },
            environmentVariants: [
              {environmentId: 'prod', value: json({key: 'prod-value'}), schema: null, overrides: []},
            ],
            editorEmails: [],
            maintainerEmails: ['maintainer@example.com'],
          },
          proposed: {
            defaultVariant: {
              value: json({key: 'changed'}),
              schema: null,
              overrides: [],
            },
            environmentVariants: [
              {environmentId: 'prod', value: json({key: 'prod-value'}), schema: null, overrides: []},
            ],
            editorEmails: [],
            maintainerEmails: ['maintainer@example.com'],
          },
        });

        const result = isProposalRequired(params);

        expect(result.required).toBe(false);
      });

      it('should NOT require proposal when default value changes but no environments require proposals', () => {
        const params = createBaseParams({
          environments: [
            {id: 'prod', requireProposals: false},
            {id: 'dev', requireProposals: false},
          ],
          proposed: {
            defaultVariant: {
              value: json({key: 'changed'}),
              schema: null,
              overrides: [],
            },
            environmentVariants: [],
            editorEmails: [],
            maintainerEmails: ['maintainer@example.com'],
          },
        });

        const result = isProposalRequired(params);

        expect(result.required).toBe(false);
      });
    });

    describe('when environment variants change', () => {
      it('should require proposal when protected environment variant value changes', () => {
        const params = createBaseParams({
          current: {
            defaultVariant: {
              value: json({key: 'value'}),
              schema: null,
              overrides: [],
            },
            environmentVariants: [
              {environmentId: 'prod', value: json({key: 'prod-value'}), schema: null, overrides: []},
            ],
            editorEmails: [],
            maintainerEmails: ['maintainer@example.com'],
          },
          proposed: {
            defaultVariant: {
              value: json({key: 'value'}),
              schema: null,
              overrides: [],
            },
            environmentVariants: [
              {environmentId: 'prod', value: json({key: 'prod-changed'}), schema: null, overrides: []},
            ],
            editorEmails: [],
            maintainerEmails: ['maintainer@example.com'],
          },
        });

        const result = isProposalRequired(params);

        expect(result.required).toBe(true);
        expect(result.reason).toBe('Changes affect environments that require proposals');
        expect(result.affectedEnvironmentIds).toEqual(['prod']);
      });

      it('should NOT require proposal when unprotected environment variant changes', () => {
        const params = createBaseParams({
          current: {
            defaultVariant: {
              value: json({key: 'value'}),
              schema: null,
              overrides: [],
            },
            environmentVariants: [
              {environmentId: 'dev', value: json({key: 'dev-value'}), schema: null, overrides: []},
            ],
            editorEmails: [],
            maintainerEmails: ['maintainer@example.com'],
          },
          proposed: {
            defaultVariant: {
              value: json({key: 'value'}),
              schema: null,
              overrides: [],
            },
            environmentVariants: [
              {environmentId: 'dev', value: json({key: 'dev-changed'}), schema: null, overrides: []},
            ],
            editorEmails: [],
            maintainerEmails: ['maintainer@example.com'],
          },
        });

        const result = isProposalRequired(params);

        expect(result.required).toBe(false);
      });

      it('should require proposal when new variant is added to protected environment', () => {
        const params = createBaseParams({
          current: {
            defaultVariant: {
              value: json({key: 'value'}),
              schema: null,
              overrides: [],
            },
            environmentVariants: [],
            editorEmails: [],
            maintainerEmails: ['maintainer@example.com'],
          },
          proposed: {
            defaultVariant: {
              value: json({key: 'value'}),
              schema: null,
              overrides: [],
            },
            environmentVariants: [
              {environmentId: 'prod', value: json({key: 'prod-value'}), schema: null, overrides: []},
            ],
            editorEmails: [],
            maintainerEmails: ['maintainer@example.com'],
          },
        });

        const result = isProposalRequired(params);

        expect(result.required).toBe(true);
        expect(result.reason).toBe('Changes affect environments that require proposals');
        expect(result.affectedEnvironmentIds).toEqual(['prod']);
      });

      it('should require proposal when variant is deleted from protected environment', () => {
        const params = createBaseParams({
          current: {
            defaultVariant: {
              value: json({key: 'value'}),
              schema: null,
              overrides: [],
            },
            environmentVariants: [
              {environmentId: 'prod', value: json({key: 'prod-value'}), schema: null, overrides: []},
            ],
            editorEmails: [],
            maintainerEmails: ['maintainer@example.com'],
          },
          proposed: {
            defaultVariant: {
              value: json({key: 'value'}),
              schema: null,
              overrides: [],
            },
            environmentVariants: [],
            editorEmails: [],
            maintainerEmails: ['maintainer@example.com'],
          },
        });

        const result = isProposalRequired(params);

        expect(result.required).toBe(true);
        expect(result.reason).toBe('Changes affect environments that require proposals');
        expect(result.affectedEnvironmentIds).toEqual(['prod']);
      });

      it('should NOT require proposal when variant is deleted from unprotected environment', () => {
        const params = createBaseParams({
          current: {
            defaultVariant: {
              value: json({key: 'value'}),
              schema: null,
              overrides: [],
            },
            environmentVariants: [
              {environmentId: 'dev', value: json({key: 'dev-value'}), schema: null, overrides: []},
            ],
            editorEmails: [],
            maintainerEmails: ['maintainer@example.com'],
          },
          proposed: {
            defaultVariant: {
              value: json({key: 'value'}),
              schema: null,
              overrides: [],
            },
            environmentVariants: [],
            editorEmails: [],
            maintainerEmails: ['maintainer@example.com'],
          },
        });

        const result = isProposalRequired(params);

        expect(result.required).toBe(false);
      });

      it('should require proposal when environment variant schema changes', () => {
        const params = createBaseParams({
          current: {
            defaultVariant: {
              value: json({key: 'value'}),
              schema: null,
              overrides: [],
            },
            environmentVariants: [
              {environmentId: 'prod', value: json({key: 'prod-value'}), schema: null, overrides: []},
            ],
            editorEmails: [],
            maintainerEmails: ['maintainer@example.com'],
          },
          proposed: {
            defaultVariant: {
              value: json({key: 'value'}),
              schema: null,
              overrides: [],
            },
            environmentVariants: [
              {
                environmentId: 'prod',
                value: json({key: 'prod-value'}),
                schema: jsonSchema({type: 'object'}),
                overrides: [],
              },
            ],
            editorEmails: [],
            maintainerEmails: ['maintainer@example.com'],
          },
        });

        const result = isProposalRequired(params);

        expect(result.required).toBe(true);
        expect(result.reason).toBe('Changes affect environments that require proposals');
      });

      it('should require proposal when environment variant overrides change', () => {
        const params = createBaseParams({
          current: {
            defaultVariant: {
              value: json({key: 'value'}),
              schema: null,
              overrides: [],
            },
            environmentVariants: [
              {environmentId: 'prod', value: json({key: 'prod-value'}), schema: null, overrides: []},
            ],
            editorEmails: [],
            maintainerEmails: ['maintainer@example.com'],
          },
          proposed: {
            defaultVariant: {
              value: json({key: 'value'}),
              schema: null,
              overrides: [],
            },
            environmentVariants: [
              {
                environmentId: 'prod',
                value: json({key: 'prod-value'}),
                schema: null,
                overrides: [{name: 'override', conditions: [], value: json('override')}],
              },
            ],
            editorEmails: [],
            maintainerEmails: ['maintainer@example.com'],
          },
        });

        const result = isProposalRequired(params);

        expect(result.required).toBe(true);
        expect(result.reason).toBe('Changes affect environments that require proposals');
      });
    });

    describe('when only formatting differs', () => {
      const schema = {type: 'object', properties: {key: {type: 'string'}}};

      function variant(space?: number) {
        return {
          value: json({key: 'value'}, space),
          schema: jsonSchema(schema, space),
          overrides: [{name: 'beta', conditions: [], value: json({key: 'beta'}, space)}],
        };
      }

      it('should not require proposal for a pretty-printed default variant', () => {
        const params = createBaseParams({
          current: {
            defaultVariant: variant(),
            environmentVariants: [],
            editorEmails: [],
            maintainerEmails: ['maintainer@example.com'],
          },
          proposed: {
            defaultVariant: variant(2),
            environmentVariants: [],
            editorEmails: [],
            maintainerEmails: ['maintainer@example.com'],
          },
        });

        expect(isProposalRequired(params)).toEqual({required: false});
      });

      it('should not require proposal for a pretty-printed protected environment variant', () => {
        const params = createBaseParams({
          current: {
            defaultVariant: variant(),
            environmentVariants: [{environmentId: 'prod', ...variant()}],
            editorEmails: [],
            maintainerEmails: ['maintainer@example.com'],
          },
          proposed: {
            defaultVariant: variant(),
            environmentVariants: [{environmentId: 'prod', ...variant(2)}],
            editorEmails: [],
            maintainerEmails: ['maintainer@example.com'],
          },
        });

        expect(isProposalRequired(params)).toEqual({required: false});
      });

      it('should still require proposal when a pretty-printed value has a real change', () => {
        const params = createBaseParams({
          proposed: {
            defaultVariant: {
              value: json({key: 'changed'}, 2),
              schema: null,
              overrides: [],
            },
            environmentVariants: [],
            editorEmails: [],
            maintainerEmails: ['maintainer@example.com'],
          },
        });

        const result = isProposalRequired(params);

        expect(result.required).toBe(true);
        expect(result.reason).toBe('Default value changed');
      });
    });

    describe('when no changes are made', () => {
      it('should return required: false', () => {
        const params = createBaseParams();

        const result = isProposalRequired(params);

        expect(result).toEqual({required: false});
      });
    });

    describe('multiple protected environments', () => {
      it('should return all affected environment IDs', () => {
        const params = createBaseParams({
          environments: [
            {id: 'prod-us', requireProposals: true},
            {id: 'prod-eu', requireProposals: true},
            {id: 'staging', requireProposals: true},
            {id: 'dev', requireProposals: false},
          ],
          current: {
            defaultVariant: {
              value: json({key: 'value'}),
              schema: null,
              overrides: [],
            },
            environmentVariants: [
              {
                environmentId: 'staging',
                value: json({key: 'staging-value'}),
                schema: null,
                overrides: [],
              },
            ],
            editorEmails: [],
            maintainerEmails: ['maintainer@example.com'],
          },
          proposed: {
            defaultVariant: {
              value: json({key: 'changed'}),
              schema: null,
              overrides: [],
            },
            environmentVariants: [
              {
                environmentId: 'staging',
                value: json({key: 'staging-value'}),
                schema: null,
                overrides: [],
              },
            ],
            editorEmails: [],
            maintainerEmails: ['maintainer@example.com'],
          },
        });

        const result = isProposalRequired(params);

        expect(result.required).toBe(true);
        expect(result.reason).toBe('Default value changed');
        // staging has an override, so it shouldn't be affected
        expect(result.affectedEnvironmentIds).toEqual(['prod-us', 'prod-eu']);
      });

      it('should deduplicate affected environment IDs', () => {
        const params = createBaseParams({
          environments: [{id: 'prod', requireProposals: true}],
          current: {
            defaultVariant: {
              value: json({key: 'value'}),
              schema: null,
              overrides: [],
            },
            environmentVariants: [
              {environmentId: 'prod', value: json({key: 'prod-value'}), schema: null, overrides: []},
            ],
            editorEmails: [],
            maintainerEmails: ['maintainer@example.com'],
          },
          proposed: {
            defaultVariant: {
              value: json({key: 'value'}),
              schema: null,
              overrides: [],
            },
            // Variant changed + would be deleted (hypothetical edge case)
            environmentVariants: [],
            editorEmails: [],
            maintainerEmails: ['maintainer@example.com'],
          },
        });

        const result = isProposalRequired(params);

        expect(result.required).toBe(true);
        // prod should only appear once even if matched by multiple conditions
        expect(result.affectedEnvironmentIds).toEqual(['prod']);
      });
    });
  });
});
