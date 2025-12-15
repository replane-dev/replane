import {describe, expect, it} from 'vitest';
import {
  getProtectedEnvironmentsAffectedByBaseConfig,
  isProposalRequired,
  type ProposalRequirementParams,
} from './proposal-requirement';

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
          value: {key: 'value'},
          schema: null,
          overrides: [],
        },
        environmentVariants: [],
        editorEmails: [],
        maintainerEmails: ['maintainer@example.com'],
      },
      proposed: {
        defaultVariant: {
          value: {key: 'value'},
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
              value: {key: 'different'},
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
              value: {key: 'value'},
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
              value: {key: 'value'},
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
              value: {key: 'value'},
              schema: null,
              overrides: [],
            },
            environmentVariants: [],
            editorEmails: ['b@example.com', 'a@example.com'],
            maintainerEmails: ['maintainer@example.com'],
          },
          proposed: {
            defaultVariant: {
              value: {key: 'value'},
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
              value: {key: 'changed'},
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
              value: {key: 'value'},
              schema: {type: 'object'},
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
              value: {key: 'value'},
              schema: null,
              // Using 'as any' because the test only verifies JSON comparison behavior
              overrides: [{conditions: [], value: {type: 'literal', value: 'override'}}] as any,
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
              value: {key: 'value'},
              schema: null,
              overrides: [],
            },
            environmentVariants: [
              {environmentId: 'prod', value: {key: 'prod-value'}, schema: null, overrides: []},
            ],
            editorEmails: [],
            maintainerEmails: ['maintainer@example.com'],
          },
          proposed: {
            defaultVariant: {
              value: {key: 'changed'},
              schema: null,
              overrides: [],
            },
            environmentVariants: [
              {environmentId: 'prod', value: {key: 'prod-value'}, schema: null, overrides: []},
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
              value: {key: 'changed'},
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
              value: {key: 'value'},
              schema: null,
              overrides: [],
            },
            environmentVariants: [
              {environmentId: 'prod', value: {key: 'prod-value'}, schema: null, overrides: []},
            ],
            editorEmails: [],
            maintainerEmails: ['maintainer@example.com'],
          },
          proposed: {
            defaultVariant: {
              value: {key: 'value'},
              schema: null,
              overrides: [],
            },
            environmentVariants: [
              {environmentId: 'prod', value: {key: 'prod-changed'}, schema: null, overrides: []},
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
              value: {key: 'value'},
              schema: null,
              overrides: [],
            },
            environmentVariants: [
              {environmentId: 'dev', value: {key: 'dev-value'}, schema: null, overrides: []},
            ],
            editorEmails: [],
            maintainerEmails: ['maintainer@example.com'],
          },
          proposed: {
            defaultVariant: {
              value: {key: 'value'},
              schema: null,
              overrides: [],
            },
            environmentVariants: [
              {environmentId: 'dev', value: {key: 'dev-changed'}, schema: null, overrides: []},
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
              value: {key: 'value'},
              schema: null,
              overrides: [],
            },
            environmentVariants: [],
            editorEmails: [],
            maintainerEmails: ['maintainer@example.com'],
          },
          proposed: {
            defaultVariant: {
              value: {key: 'value'},
              schema: null,
              overrides: [],
            },
            environmentVariants: [
              {environmentId: 'prod', value: {key: 'prod-value'}, schema: null, overrides: []},
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
              value: {key: 'value'},
              schema: null,
              overrides: [],
            },
            environmentVariants: [
              {environmentId: 'prod', value: {key: 'prod-value'}, schema: null, overrides: []},
            ],
            editorEmails: [],
            maintainerEmails: ['maintainer@example.com'],
          },
          proposed: {
            defaultVariant: {
              value: {key: 'value'},
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
              value: {key: 'value'},
              schema: null,
              overrides: [],
            },
            environmentVariants: [
              {environmentId: 'dev', value: {key: 'dev-value'}, schema: null, overrides: []},
            ],
            editorEmails: [],
            maintainerEmails: ['maintainer@example.com'],
          },
          proposed: {
            defaultVariant: {
              value: {key: 'value'},
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
              value: {key: 'value'},
              schema: null,
              overrides: [],
            },
            environmentVariants: [
              {environmentId: 'prod', value: {key: 'prod-value'}, schema: null, overrides: []},
            ],
            editorEmails: [],
            maintainerEmails: ['maintainer@example.com'],
          },
          proposed: {
            defaultVariant: {
              value: {key: 'value'},
              schema: null,
              overrides: [],
            },
            environmentVariants: [
              {
                environmentId: 'prod',
                value: {key: 'prod-value'},
                schema: {type: 'object'},
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
              value: {key: 'value'},
              schema: null,
              overrides: [],
            },
            environmentVariants: [
              {environmentId: 'prod', value: {key: 'prod-value'}, schema: null, overrides: []},
            ],
            editorEmails: [],
            maintainerEmails: ['maintainer@example.com'],
          },
          proposed: {
            defaultVariant: {
              value: {key: 'value'},
              schema: null,
              overrides: [],
            },
            environmentVariants: [
              {
                environmentId: 'prod',
                value: {key: 'prod-value'},
                schema: null,
                // Using 'as any' because the test only verifies JSON comparison behavior
                overrides: [{conditions: [], value: {type: 'literal', value: 'override'}}] as any,
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
              value: {key: 'value'},
              schema: null,
              overrides: [],
            },
            environmentVariants: [
              {
                environmentId: 'staging',
                value: {key: 'staging-value'},
                schema: null,
                overrides: [],
              },
            ],
            editorEmails: [],
            maintainerEmails: ['maintainer@example.com'],
          },
          proposed: {
            defaultVariant: {
              value: {key: 'changed'},
              schema: null,
              overrides: [],
            },
            environmentVariants: [
              {
                environmentId: 'staging',
                value: {key: 'staging-value'},
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
              value: {key: 'value'},
              schema: null,
              overrides: [],
            },
            environmentVariants: [
              {environmentId: 'prod', value: {key: 'prod-value'}, schema: null, overrides: []},
            ],
            editorEmails: [],
            maintainerEmails: ['maintainer@example.com'],
          },
          proposed: {
            defaultVariant: {
              value: {key: 'value'},
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
