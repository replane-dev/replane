import {GLOBAL_CONTEXT} from '@/engine/core/context';
import {BadRequestError} from '@/engine/core/errors';
import {normalizeEmail} from '@/engine/core/utils';
import {describe, expect, it} from 'vitest';
import {useAppFixture} from './fixtures/trpc-fixture';

const CURRENT_USER_EMAIL = normalizeEmail('test@example.com');

describe('Default Variant', () => {
  const fixture = useAppFixture({authEmail: CURRENT_USER_EMAIL});

  describe('createConfig with default variant', () => {
    it('should create config with only default variant (no environment-specific variants)', async () => {
      const {configId, configVariantIds} = await fixture.engine.useCases.createConfig(
        GLOBAL_CONTEXT,
        {
          name: 'default-only-config',
          description: 'Config with only default variant',
          currentUserEmail: CURRENT_USER_EMAIL,
          editorEmails: [],
          maintainerEmails: [],
          projectId: fixture.projectId,
          defaultVariant: {
            value: {feature: 'enabled'},
            schema: {type: 'object', properties: {feature: {type: 'string'}}},
            overrides: [],
          },
          environmentVariants: [],
        },
      );

      expect(configId).toBeDefined();

      // Should have created a default variant (environmentId = null)
      const defaultVariantEntry = configVariantIds.find(v => v.environmentId === null);
      expect(defaultVariantEntry).toBeDefined();
      expect(defaultVariantEntry?.variantId).toBeDefined();

      // getConfig filters out default variants for the UI, so we check that configs were created
      const {config} = await fixture.trpc.getConfig({
        name: 'default-only-config',
        projectId: fixture.projectId,
      });

      expect(config).toBeDefined();
      expect(config?.config.id).toBe(configId);
      expect(config?.config.name).toBe('default-only-config');
      // variants in getConfig won't include default variant (filtered out in UI layer)
      // but the config was created successfully
    });

    it('should create config with default variant and some environment-specific variants', async () => {
      const {configId, configVariantIds} = await fixture.engine.useCases.createConfig(
        GLOBAL_CONTEXT,
        {
          name: 'mixed-variants-config',
          description: 'Config with mixed variants',
          currentUserEmail: CURRENT_USER_EMAIL,
          editorEmails: [],
          maintainerEmails: [],
          projectId: fixture.projectId,
          defaultVariant: {
            value: {limit: 100},
            schema: {type: 'object', properties: {limit: {type: 'number'}}},
            overrides: [],
          },
          environmentVariants: [
            {
              environmentId: fixture.productionEnvironmentId,
              value: {limit: 1000}, // Production has higher limit
              schema: {type: 'object', properties: {limit: {type: 'number'}}},
              overrides: [],
            },
          ],
        },
      );

      expect(configId).toBeDefined();

      // Should have default variant (null environmentId)
      const defaultVariantEntry = configVariantIds.find(v => v.environmentId === null);
      expect(defaultVariantEntry).toBeDefined();

      // Should have production-specific variant
      const prodVariantEntry = configVariantIds.find(
        v => v.environmentId === fixture.productionEnvironmentId,
      );
      expect(prodVariantEntry).toBeDefined();

      // getConfig should return the production variant
      const {config} = await fixture.trpc.getConfig({
        name: 'mixed-variants-config',
        projectId: fixture.projectId,
      });

      expect(config).toBeDefined();

      // Only production variant should appear in UI response (default is filtered, dev falls back to default)
      const prodVariant = config?.variants.find(
        v => v.environmentId === fixture.productionEnvironmentId,
      );
      expect(prodVariant).toBeDefined();
      expect(prodVariant?.value).toEqual({limit: 1000});
    });

    it('should create config with all environment-specific variants (no default needed)', async () => {
      const {configId, configVariantIds} = await fixture.engine.useCases.createConfig(
        GLOBAL_CONTEXT,
        {
          name: 'all-envs-config',
          description: 'Config with all environments covered',
          currentUserEmail: CURRENT_USER_EMAIL,
          editorEmails: [],
          maintainerEmails: [],
          projectId: fixture.projectId,
          // No default variant
          environmentVariants: [
            {
              environmentId: fixture.productionEnvironmentId,
              value: {env: 'production'},
              schema: null,
              overrides: [],
            },
            {
              environmentId: fixture.developmentEnvironmentId,
              value: {env: 'development'},
              schema: null,
              overrides: [],
            },
          ],
        },
      );

      expect(configId).toBeDefined();

      // Should NOT have default variant
      const defaultVariantEntry = configVariantIds.find(v => v.environmentId === null);
      expect(defaultVariantEntry).toBeUndefined();

      // Should have both environment-specific variants
      expect(configVariantIds).toHaveLength(2);

      const {config} = await fixture.trpc.getConfig({
        name: 'all-envs-config',
        projectId: fixture.projectId,
      });

      expect(config).toBeDefined();

      // Should have both environment-specific variants
      const prodVariant = config?.variants.find(
        v => v.environmentId === fixture.productionEnvironmentId,
      );
      expect(prodVariant?.value).toEqual({env: 'production'});

      const devVariant = config?.variants.find(
        v => v.environmentId === fixture.developmentEnvironmentId,
      );
      expect(devVariant?.value).toEqual({env: 'development'});
    });
  });

  describe('validation', () => {
    it('should throw error when missing environments and no default variant', async () => {
      await expect(
        fixture.engine.useCases.createConfig(GLOBAL_CONTEXT, {
          name: 'invalid-missing-default',
          description: 'Should fail',
          currentUserEmail: CURRENT_USER_EMAIL,
          editorEmails: [],
          maintainerEmails: [],
          projectId: fixture.projectId,
          // Only providing production variant, missing development
          environmentVariants: [
            {
              environmentId: fixture.productionEnvironmentId,
              value: {test: true},
              schema: null,
              overrides: [],
            },
          ],
        }),
      ).rejects.toThrow(BadRequestError);

      await expect(
        fixture.engine.useCases.createConfig(GLOBAL_CONTEXT, {
          name: 'invalid-missing-default2',
          description: 'Should fail',
          currentUserEmail: CURRENT_USER_EMAIL,
          editorEmails: [],
          maintainerEmails: [],
          projectId: fixture.projectId,
          environmentVariants: [
            {
              environmentId: fixture.productionEnvironmentId,
              value: {test: true},
              schema: null,
              overrides: [],
            },
          ],
        }),
      ).rejects.toThrow(/Default variant is required/);
    });

    it('should throw error when neither default nor environment variants provided', async () => {
      await expect(
        fixture.engine.useCases.createConfig(GLOBAL_CONTEXT, {
          name: 'invalid-no-variants',
          description: 'Should fail',
          currentUserEmail: CURRENT_USER_EMAIL,
          editorEmails: [],
          maintainerEmails: [],
          projectId: fixture.projectId,
          // Neither defaultVariant nor environmentVariants
        }),
      ).rejects.toThrow(BadRequestError);
    });

    it('should validate default variant value against schema', async () => {
      await expect(
        fixture.engine.useCases.createConfig(GLOBAL_CONTEXT, {
          name: 'invalid-default-schema',
          description: 'Should fail schema validation',
          currentUserEmail: CURRENT_USER_EMAIL,
          editorEmails: [],
          maintainerEmails: [],
          projectId: fixture.projectId,
          defaultVariant: {
            value: {count: 'not-a-number'}, // Should be a number
            schema: {type: 'object', properties: {count: {type: 'number'}}},
            overrides: [],
          },
        }),
      ).rejects.toThrow(BadRequestError);
    });

    it('should validate environment variant value against schema', async () => {
      await expect(
        fixture.engine.useCases.createConfig(GLOBAL_CONTEXT, {
          name: 'invalid-env-schema',
          description: 'Should fail schema validation',
          currentUserEmail: CURRENT_USER_EMAIL,
          editorEmails: [],
          maintainerEmails: [],
          projectId: fixture.projectId,
          defaultVariant: {
            value: {valid: true},
            schema: null,
            overrides: [],
          },
          environmentVariants: [
            {
              environmentId: fixture.productionEnvironmentId,
              value: 'not-an-object', // Should be an object per schema
              schema: {type: 'object'},
              overrides: [],
            },
          ],
        }),
      ).rejects.toThrow(BadRequestError);
    });

    it('should reject invalid environment ID in environment variants', async () => {
      await expect(
        fixture.engine.useCases.createConfig(GLOBAL_CONTEXT, {
          name: 'invalid-env-id',
          description: 'Should fail',
          currentUserEmail: CURRENT_USER_EMAIL,
          editorEmails: [],
          maintainerEmails: [],
          projectId: fixture.projectId,
          defaultVariant: {
            value: {test: true},
            schema: null,
            overrides: [],
          },
          environmentVariants: [
            {
              environmentId: 'non-existent-env-id',
              value: {test: false},
              schema: null,
              overrides: [],
            },
          ],
        }),
      ).rejects.toThrow(/Invalid environment ID/);
    });
  });

  describe('default variant fallback behavior', () => {
    it('should allow creation of config with only default when environments will use fallback', async () => {
      // Create config with only default variant
      const {configId, configVariantIds} = await fixture.engine.useCases.createConfig(
        GLOBAL_CONTEXT,
        {
          name: 'fallback-test-config',
          description: 'Test fallback',
          currentUserEmail: CURRENT_USER_EMAIL,
          editorEmails: [],
          maintainerEmails: [],
          projectId: fixture.projectId,
          defaultVariant: {
            value: {defaultValue: 'from-default'},
            schema: null,
            overrides: [],
          },
          environmentVariants: [], // No environment-specific variants
        },
      );

      expect(configId).toBeDefined();

      // Should have created exactly 1 variant (the default)
      expect(configVariantIds).toHaveLength(1);
      expect(configVariantIds[0].environmentId).toBeNull();
    });

    it('should create environment-specific variants that override default', async () => {
      const {configVariantIds} = await fixture.engine.useCases.createConfig(GLOBAL_CONTEXT, {
        name: 'override-test-config',
        description: 'Test override',
        currentUserEmail: CURRENT_USER_EMAIL,
        editorEmails: [],
        maintainerEmails: [],
        projectId: fixture.projectId,
        defaultVariant: {
          value: {source: 'default'},
          schema: null,
          overrides: [],
        },
        environmentVariants: [
          {
            environmentId: fixture.productionEnvironmentId,
            value: {source: 'production-specific'},
            schema: null,
            overrides: [],
          },
        ],
      });

      // Should have 2 variants: default + production
      expect(configVariantIds).toHaveLength(2);

      const hasDefault = configVariantIds.some(v => v.environmentId === null);
      const hasProd = configVariantIds.some(
        v => v.environmentId === fixture.productionEnvironmentId,
      );

      expect(hasDefault).toBe(true);
      expect(hasProd).toBe(true);
    });
  });

  describe('schema inheritance (useDefaultSchema)', () => {
    it('should validate environment variant value against default schema when useDefaultSchema is true', async () => {
      // Create config with default schema and env variant using default schema
      await fixture.engine.useCases.createConfig(GLOBAL_CONTEXT, {
        name: 'schema-inherit-config',
        description: 'Test schema inheritance',
        currentUserEmail: CURRENT_USER_EMAIL,
        editorEmails: [],
        maintainerEmails: [],
        projectId: fixture.projectId,
        defaultVariant: {
          value: {count: 100},
          schema: {type: 'object', properties: {count: {type: 'number'}}, required: ['count']},
          overrides: [],
        },
        environmentVariants: [
          {
            environmentId: fixture.productionEnvironmentId,
            value: {count: 500}, // This should validate against default schema
            schema: null, // No specific schema
            overrides: [],
            useDefaultSchema: true, // Inherit from default
          },
        ],
      });

      const {config} = await fixture.trpc.getConfig({
        name: 'schema-inherit-config',
        projectId: fixture.projectId,
      });

      expect(config).toBeDefined();
      const prodVariant = config?.variants.find(
        v => v.environmentId === fixture.productionEnvironmentId,
      );
      expect(prodVariant).toBeDefined();
      expect(prodVariant?.value).toEqual({count: 500});
      // Schema should be null (inheriting from default)
      expect(prodVariant?.schema).toBeNull();
    });

    it('should fail validation when useDefaultSchema is true but value does not match default schema', async () => {
      await expect(
        fixture.engine.useCases.createConfig(GLOBAL_CONTEXT, {
          name: 'schema-inherit-fail-config',
          description: 'Test schema inheritance failure',
          currentUserEmail: CURRENT_USER_EMAIL,
          editorEmails: [],
          maintainerEmails: [],
          projectId: fixture.projectId,
          defaultVariant: {
            value: {count: 100},
            schema: {type: 'object', properties: {count: {type: 'number'}}, required: ['count']},
            overrides: [],
          },
          environmentVariants: [
            {
              environmentId: fixture.productionEnvironmentId,
              value: {count: 'not-a-number'}, // Should fail validation
              schema: null,
              overrides: [],
              useDefaultSchema: true,
            },
          ],
        }),
      ).rejects.toThrow(BadRequestError);
    });

    it('should fail when useDefaultSchema is true but no default variant is provided', async () => {
      await expect(
        fixture.engine.useCases.createConfig(GLOBAL_CONTEXT, {
          name: 'schema-inherit-no-default-config',
          description: 'Test schema inheritance without default',
          currentUserEmail: CURRENT_USER_EMAIL,
          editorEmails: [],
          maintainerEmails: [],
          projectId: fixture.projectId,
          // No default variant
          environmentVariants: [
            {
              environmentId: fixture.productionEnvironmentId,
              value: {count: 100},
              schema: null,
              overrides: [],
              useDefaultSchema: true, // This should fail
            },
            {
              environmentId: fixture.developmentEnvironmentId,
              value: {count: 200},
              schema: null,
              overrides: [],
            },
          ],
        }),
      ).rejects.toThrow(/Cannot use default schema when no default variant is provided/);
    });

    it('should allow useDefaultSchema with null default schema (no validation)', async () => {
      // Default variant without schema, env variant uses default schema (so no validation)
      await fixture.engine.useCases.createConfig(GLOBAL_CONTEXT, {
        name: 'schema-inherit-null-config',
        description: 'Test schema inheritance with null',
        currentUserEmail: CURRENT_USER_EMAIL,
        editorEmails: [],
        maintainerEmails: [],
        projectId: fixture.projectId,
        defaultVariant: {
          value: {anything: 'goes'},
          schema: null, // No schema
          overrides: [],
        },
        environmentVariants: [
          {
            environmentId: fixture.productionEnvironmentId,
            value: {completely: 'different'}, // Should pass because no schema
            schema: null,
            overrides: [],
            useDefaultSchema: true,
          },
        ],
      });

      const {config} = await fixture.trpc.getConfig({
        name: 'schema-inherit-null-config',
        projectId: fixture.projectId,
      });

      expect(config).toBeDefined();
    });
  });

  describe('API response for configs with default variant', () => {
    it('should return config successfully when only default variant exists', async () => {
      await fixture.engine.useCases.createConfig(GLOBAL_CONTEXT, {
        name: 'api-response-test',
        description: 'Test API response',
        currentUserEmail: CURRENT_USER_EMAIL,
        editorEmails: [],
        maintainerEmails: [],
        projectId: fixture.projectId,
        defaultVariant: {
          value: {key: 'default-value'},
          schema: {type: 'object'},
          overrides: [],
        },
        environmentVariants: [],
      });

      const {config} = await fixture.trpc.getConfig({
        name: 'api-response-test',
        projectId: fixture.projectId,
      });

      expect(config).toBeDefined();
      expect(config?.config.name).toBe('api-response-test');
      // Note: default variant is not included in variants array in getConfig response
      // This is by design - the UI shows environment tabs, not the default
    });

    it('should return both environment variants when they exist alongside default', async () => {
      await fixture.engine.useCases.createConfig(GLOBAL_CONTEXT, {
        name: 'mixed-api-response-test',
        description: 'Test mixed API response',
        currentUserEmail: CURRENT_USER_EMAIL,
        editorEmails: [],
        maintainerEmails: [],
        projectId: fixture.projectId,
        defaultVariant: {
          value: {base: 'default'},
          schema: null,
          overrides: [],
        },
        environmentVariants: [
          {
            environmentId: fixture.productionEnvironmentId,
            value: {base: 'production'},
            schema: null,
            overrides: [],
          },
          {
            environmentId: fixture.developmentEnvironmentId,
            value: {base: 'development'},
            schema: null,
            overrides: [],
          },
        ],
      });

      const {config} = await fixture.trpc.getConfig({
        name: 'mixed-api-response-test',
        projectId: fixture.projectId,
      });

      expect(config).toBeDefined();
      // Should have 3 variants: default + 2 environment-specific
      expect(config?.variants).toHaveLength(3);

      const defaultVariant = config?.variants.find(v => v.environmentId === null);
      expect(defaultVariant?.value).toEqual({base: 'default'});

      const prodVariant = config?.variants.find(
        v => v.environmentId === fixture.productionEnvironmentId,
      );
      expect(prodVariant?.value).toEqual({base: 'production'});

      const devVariant = config?.variants.find(
        v => v.environmentId === fixture.developmentEnvironmentId,
      );
      expect(devVariant?.value).toEqual({base: 'development'});
    });
  });

  describe('patchConfig with schema inheritance (useDefaultSchema)', () => {
    it('should validate patched value against default schema when useDefaultSchema is true', async () => {
      // Create config with default schema and env variant with its own schema
      const {configVariantIds} = await fixture.engine.useCases.createConfig(GLOBAL_CONTEXT, {
        name: 'patch-schema-inherit-config',
        description: 'Test patch schema inheritance',
        currentUserEmail: CURRENT_USER_EMAIL,
        editorEmails: [],
        maintainerEmails: [],
        projectId: fixture.projectId,
        defaultVariant: {
          value: {count: 100},
          schema: {type: 'object', properties: {count: {type: 'number'}}, required: ['count']},
          overrides: [],
        },
        environmentVariants: [
          {
            environmentId: fixture.productionEnvironmentId,
            value: {count: 200},
            schema: {type: 'object', properties: {count: {type: 'number'}}}, // Own schema
            overrides: [],
          },
          {
            environmentId: fixture.developmentEnvironmentId,
            value: {count: 300},
            schema: null,
            overrides: [],
          },
        ],
      });

      const prodVariantId = configVariantIds.find(
        v => v.environmentId === fixture.productionEnvironmentId,
      )?.variantId;
      expect(prodVariantId).toBeDefined();

      const {config: beforeConfig} = await fixture.trpc.getConfig({
        name: 'patch-schema-inherit-config',
        projectId: fixture.projectId,
      });
      const configId = beforeConfig!.config.id;

      // Update the production variant to use default schema
      await fixture.trpc.updateConfig({
        configId,
        description: 'Test patch schema inheritance',
        editorEmails: [],
        maintainerEmails: [],
        defaultVariant: {
          value: {count: 100},
          schema: {type: 'object', properties: {count: {type: 'number'}}, required: ['count']},
          overrides: [],
        },
        environmentVariants: [
          {environmentId: fixture.productionEnvironmentId, value: {count: 500}, schema: null, overrides: [], useDefaultSchema: true},
          {environmentId: fixture.developmentEnvironmentId, value: {count: 300}, schema: null, overrides: []},
        ],
        prevVersion: beforeConfig!.config.version,
      });

      const {config: afterConfig} = await fixture.trpc.getConfig({
        name: 'patch-schema-inherit-config',
        projectId: fixture.projectId,
      });

      const prodVariant = afterConfig?.variants.find(
        v => v.environmentId === fixture.productionEnvironmentId,
      );
      expect(prodVariant?.value).toEqual({count: 500});
      // Schema should now be null (inheriting from default)
      expect(prodVariant?.schema).toBeNull();
    });

    it('should fail patch validation when useDefaultSchema is true but value does not match default schema', async () => {
      const {configVariantIds} = await fixture.engine.useCases.createConfig(GLOBAL_CONTEXT, {
        name: 'patch-schema-inherit-fail-config',
        description: 'Test patch schema inheritance failure',
        currentUserEmail: CURRENT_USER_EMAIL,
        editorEmails: [],
        maintainerEmails: [],
        projectId: fixture.projectId,
        defaultVariant: {
          value: {count: 100},
          schema: {type: 'object', properties: {count: {type: 'number'}}, required: ['count']},
          overrides: [],
        },
        environmentVariants: [
          {
            environmentId: fixture.productionEnvironmentId,
            value: {count: 200},
            schema: null,
            overrides: [],
          },
          {
            environmentId: fixture.developmentEnvironmentId,
            value: {count: 300},
            schema: null,
            overrides: [],
          },
        ],
      });

      const prodVariantId = configVariantIds.find(
        v => v.environmentId === fixture.productionEnvironmentId,
      )?.variantId;

      const {config} = await fixture.trpc.getConfig({
        name: 'patch-schema-inherit-fail-config',
        projectId: fixture.projectId,
      });
      const configId = config!.config.id;

      // Try to update with invalid value (count should be number but is string)
      await expect(
        fixture.trpc.updateConfig({
          configId,
          description: 'Test patch schema inheritance failure',
          editorEmails: [],
          maintainerEmails: [],
          defaultVariant: {
            value: {count: 100},
            schema: {type: 'object', properties: {count: {type: 'number'}}, required: ['count']},
            overrides: [],
          },
          environmentVariants: [
            {environmentId: fixture.productionEnvironmentId, value: {count: 'not-a-number'}, schema: null, overrides: [], useDefaultSchema: true},
            {environmentId: fixture.developmentEnvironmentId, value: {count: 300}, schema: null, overrides: []},
          ],
          prevVersion: config!.config.version,
        }),
      ).rejects.toThrow(/does not match schema/);
    });

    it('should fail patch when useDefaultSchema is true but no default variant exists', async () => {
      // Create config with only environment variants (no default)
      const {configVariantIds} = await fixture.engine.useCases.createConfig(GLOBAL_CONTEXT, {
        name: 'patch-no-default-config',
        description: 'Test patch without default',
        currentUserEmail: CURRENT_USER_EMAIL,
        editorEmails: [],
        maintainerEmails: [],
        projectId: fixture.projectId,
        environmentVariants: [
          {
            environmentId: fixture.productionEnvironmentId,
            value: {key: 'prod'},
            schema: null,
            overrides: [],
          },
          {
            environmentId: fixture.developmentEnvironmentId,
            value: {key: 'dev'},
            schema: null,
            overrides: [],
          },
        ],
      });

      const prodVariantId = configVariantIds.find(
        v => v.environmentId === fixture.productionEnvironmentId,
      )?.variantId;

      const {config} = await fixture.trpc.getConfig({
        name: 'patch-no-default-config',
        projectId: fixture.projectId,
      });
      const configId = config!.config.id;

      // Try to update with useDefaultSchema when no default exists
      await expect(
        fixture.trpc.updateConfig({
          configId,
          description: 'Test patch without default',
          editorEmails: [],
          maintainerEmails: [],
          environmentVariants: [
            {environmentId: fixture.productionEnvironmentId, value: {key: 'updated'}, schema: null, overrides: [], useDefaultSchema: true},
            {environmentId: fixture.developmentEnvironmentId, value: {key: 'dev'}, schema: null, overrides: []},
          ],
          prevVersion: config!.config.version,
        }),
      ).rejects.toThrow(/no default variant/);
    });
  });
});
