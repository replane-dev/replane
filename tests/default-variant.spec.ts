import {GLOBAL_CONTEXT} from '@/engine/core/context';
import {BadRequestError} from '@/engine/core/errors';
import {normalizeEmail} from '@/engine/core/utils';
import {asConfigSchema, asConfigValue} from '@/engine/core/zod';
import {describe, expect, it} from 'vitest';
import {emailToIdentity, useAppFixture} from './fixtures/app-fixture';

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
          identity: emailToIdentity(CURRENT_USER_EMAIL),
          editorEmails: [],
          maintainerEmails: [],
          projectId: fixture.projectId,
          defaultVariant: {
            value: asConfigValue({feature: 'enabled'}),
            schema: asConfigSchema({type: 'object', properties: {feature: {type: 'string'}}}),
            overrides: [],
          },
          environmentVariants: [],
        },
      );

      expect(configId).toBeDefined();

      // Default variant is now stored in configs table, not config_variants
      // So there should be no variant entries returned (only env-specific variants are in config_variants)
      expect(configVariantIds).toHaveLength(0);

      // getConfig should return the config with default variant data
      const {config} = await fixture.trpc.getConfig({
        name: 'default-only-config',
        projectId: fixture.projectId,
      });

      expect(config).toBeDefined();
      expect(config?.config.id).toBe(configId);
      expect(config?.config.name).toBe('default-only-config');
      // Default variant data is now in config.config (value, schema, overrides)
      expect(config?.config.value).toEqual({feature: 'enabled'});
      expect(config?.config.schema).toEqual({
        type: 'object',
        properties: {feature: {type: 'string'}},
      });
    });

    it('should create config with default variant and some environment-specific variants', async () => {
      const {configId, configVariantIds} = await fixture.engine.useCases.createConfig(
        GLOBAL_CONTEXT,
        {
          name: 'mixed-variants-config',
          description: 'Config with mixed variants',
          identity: emailToIdentity(CURRENT_USER_EMAIL),
          editorEmails: [],
          maintainerEmails: [],
          projectId: fixture.projectId,
          defaultVariant: {
            value: asConfigValue({limit: 100}),
            schema: asConfigSchema({type: 'object', properties: {limit: {type: 'number'}}}),
            overrides: [],
          },
          environmentVariants: [
            {
              environmentId: fixture.productionEnvironmentId,
              value: asConfigValue({limit: 1000}), // Production has higher limit
              schema: asConfigSchema({type: 'object', properties: {limit: {type: 'number'}}}),
              overrides: [],
              useBaseSchema: true,
            },
          ],
        },
      );

      expect(configId).toBeDefined();

      // Default variant is now in configs table, only env-specific variants are returned
      expect(configVariantIds).toHaveLength(1);

      // Should have production-specific variant
      const prodVariantEntry = configVariantIds.find(
        v => v.environmentId === fixture.productionEnvironmentId,
      );
      expect(prodVariantEntry).toBeDefined();

      // getConfig should return the config with default in config and production variant
      const {config} = await fixture.trpc.getConfig({
        name: 'mixed-variants-config',
        projectId: fixture.projectId,
      });

      expect(config).toBeDefined();

      // Default variant data is in config.config
      expect(config?.config.value).toEqual({limit: 100});

      // Production variant should be in variants array
      const prodVariant = config?.variants.find(
        v => v.environmentId === fixture.productionEnvironmentId,
      );
      expect(prodVariant).toBeDefined();
      expect(prodVariant?.value).toEqual({limit: 1000});
    });

    it('should create config with all environment-specific variants', async () => {
      // Now we always need a default variant since it's stored in configs table
      const {configId, configVariantIds} = await fixture.engine.useCases.createConfig(
        GLOBAL_CONTEXT,
        {
          name: 'all-envs-config',
          description: 'Config with all environments covered',
          identity: emailToIdentity(CURRENT_USER_EMAIL),
          editorEmails: [],
          maintainerEmails: [],
          projectId: fixture.projectId,
          // Default variant is required and stored in configs table
          defaultVariant: {
            value: asConfigValue({env: 'default'}),
            schema: null,
            overrides: [],
          },
          environmentVariants: [
            {
              environmentId: fixture.productionEnvironmentId,
              value: asConfigValue({env: 'production'}),
              schema: null,
              overrides: [],
              useBaseSchema: false,
            },
            {
              environmentId: fixture.developmentEnvironmentId,
              value: asConfigValue({env: 'development'}),
              schema: null,
              overrides: [],
              useBaseSchema: false,
            },
          ],
        },
      );

      expect(configId).toBeDefined();

      // Should have both environment-specific variants
      expect(configVariantIds).toHaveLength(2);

      const {config} = await fixture.trpc.getConfig({
        name: 'all-envs-config',
        projectId: fixture.projectId,
      });

      expect(config).toBeDefined();

      // Default variant is in config.config
      expect(config?.config.value).toEqual({env: 'default'});

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
    it('should allow creating config with only some environment variants when default is provided', async () => {
      // With the new design, defaultVariant is required and missing environment
      // variants will fall back to the default values. This should succeed.
      const result = await fixture.engine.useCases.createConfig(GLOBAL_CONTEXT, {
        name: 'partial-env-with-default',
        description: 'Should succeed with default fallback',
        identity: emailToIdentity(CURRENT_USER_EMAIL),
        editorEmails: [],
        maintainerEmails: [],
        projectId: fixture.projectId,
        // Only providing production variant, missing development - but default is provided
        environmentVariants: [
          {
            environmentId: fixture.productionEnvironmentId,
            value: asConfigValue({test: true}),
            schema: null,
            overrides: [],
            useBaseSchema: true,
          },
        ],
        defaultVariant: {
          value: asConfigValue({test: true}),
          schema: null,
          overrides: [],
        },
      });

      expect(result.configId).toBeDefined();
    });

    it('should allow creating config with only default variant (no environment variants)', async () => {
      // With the new design, defaultVariant is always required and
      // environmentVariants can be empty - missing environments will use default values
      const result = await fixture.engine.useCases.createConfig(GLOBAL_CONTEXT, {
        name: 'default-only-config',
        description: 'Should succeed with only default',
        identity: emailToIdentity(CURRENT_USER_EMAIL),
        editorEmails: [],
        maintainerEmails: [],
        projectId: fixture.projectId,
        // No environment variants, just default
        defaultVariant: {
          value: asConfigValue({test: true}),
          schema: null,
          overrides: [],
        },
      });

      expect(result.configId).toBeDefined();
    });

    it('should validate default variant value against schema', async () => {
      await expect(
        fixture.engine.useCases.createConfig(GLOBAL_CONTEXT, {
          name: 'invalid-default-schema',
          description: 'Should fail schema validation',
          identity: emailToIdentity(CURRENT_USER_EMAIL),
          editorEmails: [],
          maintainerEmails: [],
          projectId: fixture.projectId,
          defaultVariant: {
            value: asConfigValue({count: 'not-a-number'}), // Should be a number
            schema: asConfigSchema({type: 'object', properties: {count: {type: 'number'}}}),
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
          identity: emailToIdentity(CURRENT_USER_EMAIL),
          editorEmails: [],
          maintainerEmails: [],
          projectId: fixture.projectId,
          defaultVariant: {
            value: asConfigValue({valid: true}),
            schema: null,
            overrides: [],
          },
          environmentVariants: [
            {
              environmentId: fixture.productionEnvironmentId,
              value: asConfigValue('not-an-object'), // Should be an object per schema
              schema: asConfigSchema({type: 'object'}),
              overrides: [],
              useBaseSchema: false,
            },
          ],
        }),
      ).rejects.toThrow(BadRequestError);
    });

    it('should validate environment variant value against base schema', async () => {
      await expect(
        fixture.engine.useCases.createConfig(GLOBAL_CONTEXT, {
          name: 'invalid-env-schema',
          description: 'Should fail schema validation',
          identity: emailToIdentity(CURRENT_USER_EMAIL),
          editorEmails: [],
          maintainerEmails: [],
          projectId: fixture.projectId,
          defaultVariant: {
            value: asConfigValue({valid: true}),
            schema: asConfigSchema({type: 'object'}),
            overrides: [],
          },
          environmentVariants: [
            {
              environmentId: fixture.productionEnvironmentId,
              value: asConfigValue('not-an-object'), // Should be an object per schema
              schema: asConfigSchema({type: 'string'}),
              overrides: [],
              useBaseSchema: true,
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
          identity: emailToIdentity(CURRENT_USER_EMAIL),
          editorEmails: [],
          maintainerEmails: [],
          projectId: fixture.projectId,
          defaultVariant: {
            value: asConfigValue({test: true}),
            schema: null,
            overrides: [],
          },
          environmentVariants: [
            {
              environmentId: 'non-existent-env-id',
              value: asConfigValue({test: false}),
              schema: null,
              overrides: [],
              useBaseSchema: true,
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
          identity: emailToIdentity(CURRENT_USER_EMAIL),
          editorEmails: [],
          maintainerEmails: [],
          projectId: fixture.projectId,
          defaultVariant: {
            value: asConfigValue({defaultValue: 'from-default'}),
            schema: null,
            overrides: [],
          },
          environmentVariants: [], // No environment-specific variants
        },
      );

      expect(configId).toBeDefined();

      // Default is now stored in configs table, so no config_variants created
      expect(configVariantIds).toHaveLength(0);
    });

    it('should create environment-specific variants that override default', async () => {
      const {configVariantIds} = await fixture.engine.useCases.createConfig(GLOBAL_CONTEXT, {
        name: 'override-test-config',
        description: 'Test override',
        identity: emailToIdentity(CURRENT_USER_EMAIL),
        editorEmails: [],
        maintainerEmails: [],
        projectId: fixture.projectId,
        defaultVariant: {
          value: asConfigValue({source: 'default'}),
          schema: null,
          overrides: [],
        },
        environmentVariants: [
          {
            environmentId: fixture.productionEnvironmentId,
            value: asConfigValue({source: 'production-specific'}),
            schema: null,
            overrides: [],
            useBaseSchema: true,
          },
        ],
      });

      // Only production variant in config_variants (default is in configs table)
      expect(configVariantIds).toHaveLength(1);

      const hasProd = configVariantIds.some(
        v => v.environmentId === fixture.productionEnvironmentId,
      );

      expect(hasProd).toBe(true);
    });
  });

  describe('schema inheritance (useBaseSchema)', () => {
    it('should validate environment variant value against default schema when useBaseSchema is true', async () => {
      // Create config with default schema and env variant using default schema
      await fixture.engine.useCases.createConfig(GLOBAL_CONTEXT, {
        name: 'schema-inherit-config',
        description: 'Test schema inheritance',
        identity: emailToIdentity(CURRENT_USER_EMAIL),
        editorEmails: [],
        maintainerEmails: [],
        projectId: fixture.projectId,
        defaultVariant: {
          value: asConfigValue({count: 100}),
          schema: asConfigSchema({
            type: 'object',
            properties: {count: {type: 'number'}},
            required: ['count'],
          }),
          overrides: [],
        },
        environmentVariants: [
          {
            environmentId: fixture.productionEnvironmentId,
            value: asConfigValue({count: 500}), // This should validate against default schema
            schema: null, // No specific schema
            overrides: [],
            useBaseSchema: true, // Inherit from default
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

    it('should fail validation when useBaseSchema is true but value does not match default schema', async () => {
      await expect(
        fixture.engine.useCases.createConfig(GLOBAL_CONTEXT, {
          name: 'schema-inherit-fail-config',
          description: 'Test schema inheritance failure',
          identity: emailToIdentity(CURRENT_USER_EMAIL),
          editorEmails: [],
          maintainerEmails: [],
          projectId: fixture.projectId,
          defaultVariant: {
            value: asConfigValue({count: 100}),
            schema: asConfigSchema({
              type: 'object',
              properties: {count: {type: 'number'}},
              required: ['count'],
            }),
            overrides: [],
          },
          environmentVariants: [
            {
              environmentId: fixture.productionEnvironmentId,
              value: asConfigValue({count: 'not-a-number'}), // Should fail validation
              schema: null,
              overrides: [],
              useBaseSchema: true,
            },
          ],
        }),
      ).rejects.toThrow(BadRequestError);
    });

    it('should allow useBaseSchema when default variant has null schema', async () => {
      // When useBaseSchema is true and default variant has null schema,
      // no validation is performed (like skipping schema validation)
      const result = await fixture.engine.useCases.createConfig(GLOBAL_CONTEXT, {
        name: 'schema-inherit-null-schema-config',
        description: 'Test schema inheritance with null schema',
        identity: emailToIdentity(CURRENT_USER_EMAIL),
        editorEmails: [],
        maintainerEmails: [],
        projectId: fixture.projectId,
        environmentVariants: [
          {
            environmentId: fixture.productionEnvironmentId,
            value: asConfigValue({count: 100}),
            schema: null,
            overrides: [],
            useBaseSchema: true,
          },
          {
            environmentId: fixture.developmentEnvironmentId,
            value: asConfigValue({count: 200}),
            schema: null,
            overrides: [],
            useBaseSchema: true,
          },
        ],
        defaultVariant: {
          value: asConfigValue({test: true}),
          schema: null, // null schema means no validation
          overrides: [],
        },
      });

      expect(result.configId).toBeDefined();
    });

    it('should allow useBaseSchema with null default schema (no validation)', async () => {
      // Default variant without schema, env variant uses default schema (so no validation)
      await fixture.engine.useCases.createConfig(GLOBAL_CONTEXT, {
        name: 'schema-inherit-null-config',
        description: 'Test schema inheritance with null',
        identity: emailToIdentity(CURRENT_USER_EMAIL),
        editorEmails: [],
        maintainerEmails: [],
        projectId: fixture.projectId,
        defaultVariant: {
          value: asConfigValue({anything: 'goes'}),
          schema: null, // No schema
          overrides: [],
        },
        environmentVariants: [
          {
            environmentId: fixture.productionEnvironmentId,
            value: asConfigValue({completely: 'different'}), // Should pass because no schema
            schema: null,
            overrides: [],
            useBaseSchema: true,
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
        identity: emailToIdentity(CURRENT_USER_EMAIL),
        editorEmails: [],
        maintainerEmails: [],
        projectId: fixture.projectId,
        defaultVariant: {
          value: asConfigValue({key: 'default-value'}),
          schema: asConfigSchema({type: 'object'}),
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
      // Default variant data is now in config.config
      expect(config?.config.value).toEqual({key: 'default-value'});
      expect(config?.config.schema).toEqual({type: 'object'});
      // No environment variants
      expect(config?.variants).toHaveLength(0);
    });

    it('should return both environment variants when they exist alongside default', async () => {
      await fixture.engine.useCases.createConfig(GLOBAL_CONTEXT, {
        name: 'mixed-api-response-test',
        description: 'Test mixed API response',
        identity: emailToIdentity(CURRENT_USER_EMAIL),
        editorEmails: [],
        maintainerEmails: [],
        projectId: fixture.projectId,
        defaultVariant: {
          value: asConfigValue({base: 'default'}),
          schema: null,
          overrides: [],
        },
        environmentVariants: [
          {
            environmentId: fixture.productionEnvironmentId,
            value: asConfigValue({base: 'production'}),
            schema: null,
            overrides: [],
            useBaseSchema: true,
          },
          {
            environmentId: fixture.developmentEnvironmentId,
            value: asConfigValue({base: 'development'}),
            schema: null,
            overrides: [],
            useBaseSchema: true,
          },
        ],
      });

      const {config} = await fixture.trpc.getConfig({
        name: 'mixed-api-response-test',
        projectId: fixture.projectId,
      });

      expect(config).toBeDefined();

      // Default variant data is in config.config
      expect(config?.config.value).toEqual({base: 'default'});

      // Should have 2 environment-specific variants
      expect(config?.variants).toHaveLength(2);

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

  describe('patchConfig with schema inheritance (useBaseSchema)', () => {
    it('should validate patched value against default schema when useBaseSchema is true', async () => {
      // Create config with default schema and env variant with its own schema
      const {configVariantIds} = await fixture.engine.useCases.createConfig(GLOBAL_CONTEXT, {
        name: 'patch-schema-inherit-config',
        description: 'Test patch schema inheritance',
        identity: emailToIdentity(CURRENT_USER_EMAIL),
        editorEmails: [],
        maintainerEmails: [],
        projectId: fixture.projectId,
        defaultVariant: {
          value: asConfigValue({count: 100}),
          schema: asConfigSchema({
            type: 'object',
            properties: {count: {type: 'number'}},
            required: ['count'],
          }),
          overrides: [],
        },
        environmentVariants: [
          {
            environmentId: fixture.productionEnvironmentId,
            value: asConfigValue({count: 200}),
            schema: asConfigSchema({type: 'object', properties: {count: {type: 'number'}}}), // Own schema
            overrides: [],
            useBaseSchema: true,
          },
          {
            environmentId: fixture.developmentEnvironmentId,
            value: asConfigValue({count: 300}),
            schema: null,
            overrides: [],
            useBaseSchema: true,
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
        projectId: fixture.projectId,
        configName: 'patch-schema-inherit-config',
        description: 'Test patch schema inheritance',
        editorEmails: [],
        maintainerEmails: [],
        defaultVariant: {
          value: asConfigValue({count: 100}),
          schema: asConfigSchema({
            type: 'object',
            properties: {count: {type: 'number'}},
            required: ['count'],
          }),
          overrides: [],
        },
        environmentVariants: [
          {
            environmentId: fixture.productionEnvironmentId,
            value: asConfigValue({count: 500}),
            schema: null,
            overrides: [],
            useBaseSchema: true,
          },
          {
            environmentId: fixture.developmentEnvironmentId,
            value: asConfigValue({count: 300}),
            schema: null,
            overrides: [],
            useBaseSchema: true,
          },
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

    it('should fail patch validation when useBaseSchema is true but value does not match default schema', async () => {
      const {configVariantIds} = await fixture.engine.useCases.createConfig(GLOBAL_CONTEXT, {
        name: 'patch-schema-inherit-fail-config',
        description: 'Test patch schema inheritance failure',
        identity: emailToIdentity(CURRENT_USER_EMAIL),
        editorEmails: [],
        maintainerEmails: [],
        projectId: fixture.projectId,
        defaultVariant: {
          value: asConfigValue({count: 100}),
          schema: asConfigSchema({
            type: 'object',
            properties: {count: {type: 'number'}},
            required: ['count'],
          }),
          overrides: [],
        },
        environmentVariants: [
          {
            environmentId: fixture.productionEnvironmentId,
            value: asConfigValue({count: 200}),
            schema: null,
            overrides: [],
            useBaseSchema: true,
          },
          {
            environmentId: fixture.developmentEnvironmentId,
            value: asConfigValue({count: 300}),
            schema: null,
            overrides: [],
            useBaseSchema: true,
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
          projectId: fixture.projectId,
          configName: 'patch-schema-inherit-fail-config',
          description: 'Test patch schema inheritance failure',
          editorEmails: [],
          maintainerEmails: [],
          defaultVariant: {
            value: asConfigValue({count: 100}),
            schema: asConfigSchema({
              type: 'object',
              properties: {count: {type: 'number'}},
              required: ['count'],
            }),
            overrides: [],
          },
          environmentVariants: [
            {
              environmentId: fixture.productionEnvironmentId,
              value: asConfigValue({count: 'not-a-number'}),
              schema: null,
              overrides: [],
              useBaseSchema: true,
            },
            {
              environmentId: fixture.developmentEnvironmentId,
              value: asConfigValue({count: 300}),
              schema: null,
              overrides: [],
              useBaseSchema: true,
            },
          ],
          prevVersion: config!.config.version,
        }),
      ).rejects.toThrow(/does not match schema/);
    });

    it('should successfully update when useBaseSchema is true and default has schema', async () => {
      // Create config with default variant with schema
      await fixture.engine.useCases.createConfig(GLOBAL_CONTEXT, {
        name: 'patch-with-default-config',
        description: 'Test patch with default',
        identity: emailToIdentity(CURRENT_USER_EMAIL),
        editorEmails: [],
        maintainerEmails: [],
        projectId: fixture.projectId,
        defaultVariant: {
          value: asConfigValue({key: 'default'}),
          schema: asConfigSchema({type: 'object', properties: {key: {type: 'string'}}}),
          overrides: [],
        },
        environmentVariants: [
          {
            environmentId: fixture.productionEnvironmentId,
            value: asConfigValue({key: 'prod'}),
            schema: null,
            overrides: [],
            useBaseSchema: true,
          },
          {
            environmentId: fixture.developmentEnvironmentId,
            value: asConfigValue({key: 'dev'}),
            schema: null,
            overrides: [],
            useBaseSchema: true,
          },
        ],
      });

      const {config} = await fixture.trpc.getConfig({
        name: 'patch-with-default-config',
        projectId: fixture.projectId,
      });
      const configId = config!.config.id;

      // Update with useBaseSchema - should succeed since default has schema
      await fixture.trpc.updateConfig({
        projectId: fixture.projectId,
        configName: 'patch-with-default-config',
        description: 'Test patch with default - updated',
        editorEmails: [],
        maintainerEmails: [],
        defaultVariant: {
          value: asConfigValue({key: 'updated-default'}),
          schema: asConfigSchema({type: 'object', properties: {key: {type: 'string'}}}),
          overrides: [],
        },
        environmentVariants: [
          {
            environmentId: fixture.productionEnvironmentId,
            value: asConfigValue({key: 'updated-prod'}),
            schema: null,
            overrides: [],
            useBaseSchema: true,
          },
          {
            environmentId: fixture.developmentEnvironmentId,
            value: asConfigValue({key: 'updated-dev'}),
            schema: null,
            overrides: [],
            useBaseSchema: true,
          },
        ],
        prevVersion: config!.config.version,
      });

      const {config: updatedConfig} = await fixture.trpc.getConfig({
        name: 'patch-with-default-config',
        projectId: fixture.projectId,
      });

      expect(updatedConfig?.config.value).toEqual({key: 'updated-default'});
      expect(updatedConfig?.config.description).toBe('Test patch with default - updated');
    });
  });
});
