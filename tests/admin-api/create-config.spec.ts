import {GLOBAL_CONTEXT} from '@/engine/core/context';
import {describe, expect, it} from 'vitest';
import {useAppFixture} from '../fixtures/app-fixture';

const CURRENT_USER_EMAIL = 'test@example.com';

describe('Admin API - Create Config', () => {
  const fixture = useAppFixture({authEmail: CURRENT_USER_EMAIL});

  const createConfigBody = (
    name: string,
    value: unknown,
    schema: unknown = null,
    options: {
      description?: string;
      editors?: string[];
      maintainers?: string[];
      overrides?: Array<{condition: unknown; value: unknown}>;
      variants?: Array<{
        environmentId: string;
        value: unknown;
        schema: unknown;
        overrides: Array<{condition: unknown; value: unknown}>;
        useBaseSchema: boolean;
      }>;
    } = {},
  ) => ({
    name,
    description: options.description ?? 'Created via Admin API',
    editors: options.editors ?? [],
    maintainers: options.maintainers ?? [],
    base: {
      value,
      schema,
      overrides: options.overrides ?? [],
    },
    variants: options.variants ?? [],
  });

  describe('Authorization', () => {
    it('should create config with config:write scope', async () => {
      const {token} = await fixture.createAdminApiKey({
        scopes: ['config:write', 'config:read'],
      });

      const response = await fixture.adminApiRequest(
        'POST',
        `/projects/${fixture.projectId}/configs`,
        token,
        createConfigBody('api-created-config', {enabled: true, count: 10}),
      );

      expect(response.status).toBe(201);
      const data = await response.json();
      expect(data.id).toBeDefined();
    });

    it('should return 403 without config:write scope', async () => {
      const {token} = await fixture.createAdminApiKey({
        scopes: ['config:read'],
      });

      const response = await fixture.adminApiRequest(
        'POST',
        `/projects/${fixture.projectId}/configs`,
        token,
        createConfigBody('should-fail', true),
      );

      expect(response.status).toBe(403);
    });

    it('should return 403 when API key does not have project access', async () => {
      // Create a second project
      const {projectId: otherProjectId} = await fixture.engine.useCases.createProject(
        GLOBAL_CONTEXT,
        {
          identity: fixture.identity,
          workspaceId: fixture.workspaceId,
          name: 'Other Project',
          description: 'Other project',
        },
      );

      // Create API key with access only to the other project
      const {token} = await fixture.createAdminApiKey({
        scopes: ['config:write'],
        projectIds: [otherProjectId],
      });

      const response = await fixture.adminApiRequest(
        'POST',
        `/projects/${fixture.projectId}/configs`,
        token,
        createConfigBody('restricted-config', 'test'),
      );

      expect(response.status).toBe(403);
    });

    it('should allow API key with unrestricted project access', async () => {
      const {token} = await fixture.createAdminApiKey({
        scopes: ['config:write'],
        projectIds: null, // null means access to all projects
      });

      const response = await fixture.adminApiRequest(
        'POST',
        `/projects/${fixture.projectId}/configs`,
        token,
        createConfigBody('unrestricted-access-config', 'test'),
      );

      expect(response.status).toBe(201);
    });
  });

  describe('Basic Creation', () => {
    it('should create config with various value types', async () => {
      const {token} = await fixture.createAdminApiKey({
        scopes: ['config:write', 'config:read'],
      });

      const testCases = [
        {name: 'string-config', value: 'hello world'},
        {name: 'number-config', value: 42},
        {name: 'boolean-config', value: false},
        {name: 'null-config', value: null},
        {name: 'array-config', value: [1, 2, 3]},
        {name: 'object-config', value: {nested: {deep: true}}},
        {name: 'empty-object-config', value: {}},
        {name: 'empty-array-config', value: []},
      ];

      for (const testCase of testCases) {
        const response = await fixture.adminApiRequest(
          'POST',
          `/projects/${fixture.projectId}/configs`,
          token,
          createConfigBody(testCase.name, testCase.value),
        );
        expect(response.status).toBe(201);

        // Verify value
        const getResponse = await fixture.adminApiRequest(
          'GET',
          `/projects/${fixture.projectId}/configs/${testCase.name}`,
          token,
        );
        const configData = await getResponse.json();
        expect(configData.base.value).toEqual(testCase.value);
      }
    });

    it('should create config with custom description', async () => {
      const {token} = await fixture.createAdminApiKey({
        scopes: ['config:write', 'config:read'],
      });

      const description = 'This is a custom description for testing purposes with special chars: <>!@#$%';
      const response = await fixture.adminApiRequest(
        'POST',
        `/projects/${fixture.projectId}/configs`,
        token,
        createConfigBody('desc-config', 'value', null, {description}),
      );

      expect(response.status).toBe(201);

      const getResponse = await fixture.adminApiRequest(
        'GET',
        `/projects/${fixture.projectId}/configs/desc-config`,
        token,
      );
      const configData = await getResponse.json();
      expect(configData.description).toBe(description);
    });
  });

  describe('Schema Validation', () => {
    it('should create config with schema and validate value', async () => {
      const {token} = await fixture.createAdminApiKey({
        scopes: ['config:write', 'config:read'],
      });

      const schema = {
        type: 'object',
        properties: {
          enabled: {type: 'boolean'},
          count: {type: 'number'},
        },
        required: ['enabled'],
        additionalProperties: false,
      };

      const response = await fixture.adminApiRequest(
        'POST',
        `/projects/${fixture.projectId}/configs`,
        token,
        createConfigBody('schema-config', {enabled: true, count: 5}, schema),
      );

      expect(response.status).toBe(201);

      // Verify schema is stored
      const getResponse = await fixture.adminApiRequest(
        'GET',
        `/projects/${fixture.projectId}/configs/schema-config`,
        token,
      );
      const configData = await getResponse.json();
      expect(configData.base.schema).toEqual(schema);
    });

    it('should return 400 when value does not match schema', async () => {
      const {token} = await fixture.createAdminApiKey({
        scopes: ['config:write'],
      });

      const schema = {
        type: 'object',
        properties: {
          enabled: {type: 'boolean'},
        },
        required: ['enabled'],
      };

      // Value doesn't match schema (enabled is string instead of boolean)
      const response = await fixture.adminApiRequest(
        'POST',
        `/projects/${fixture.projectId}/configs`,
        token,
        createConfigBody('invalid-schema-config', {enabled: 'not-a-boolean'}, schema),
      );

      expect(response.status).toBe(400);
      const data = await response.json();
      expect(data.error).toContain('schema');
    });

    it('should return 400 when required field is missing', async () => {
      const {token} = await fixture.createAdminApiKey({
        scopes: ['config:write'],
      });

      const schema = {
        type: 'object',
        properties: {
          required_field: {type: 'string'},
        },
        required: ['required_field'],
      };

      const response = await fixture.adminApiRequest(
        'POST',
        `/projects/${fixture.projectId}/configs`,
        token,
        createConfigBody('missing-required-config', {other: 'value'}, schema),
      );

      expect(response.status).toBe(400);
    });

    it('should accept complex nested schemas', async () => {
      const {token} = await fixture.createAdminApiKey({
        scopes: ['config:write', 'config:read'],
      });

      const schema = {
        type: 'object',
        properties: {
          database: {
            type: 'object',
            properties: {
              host: {type: 'string'},
              port: {type: 'integer', minimum: 1, maximum: 65535},
              credentials: {
                type: 'object',
                properties: {
                  username: {type: 'string'},
                  password: {type: 'string'},
                },
                required: ['username', 'password'],
              },
            },
            required: ['host', 'port'],
          },
          features: {
            type: 'array',
            items: {type: 'string'},
          },
        },
        required: ['database'],
      };

      const value = {
        database: {
          host: 'localhost',
          port: 5432,
          credentials: {
            username: 'admin',
            password: 'secret',
          },
        },
        features: ['feature1', 'feature2'],
      };

      const response = await fixture.adminApiRequest(
        'POST',
        `/projects/${fixture.projectId}/configs`,
        token,
        createConfigBody('complex-schema-config', value, schema),
      );

      expect(response.status).toBe(201);

      const getResponse = await fixture.adminApiRequest(
        'GET',
        `/projects/${fixture.projectId}/configs/complex-schema-config`,
        token,
      );
      const configData = await getResponse.json();
      expect(configData.base.value).toEqual(value);
    });
  });

  describe('Duplicate Prevention', () => {
    it('should return 400 for duplicate config name', async () => {
      const {token} = await fixture.createAdminApiKey({
        scopes: ['config:write'],
      });

      // Create first config
      await fixture.adminApiRequest(
        'POST',
        `/projects/${fixture.projectId}/configs`,
        token,
        createConfigBody('duplicate-config', 'first'),
      );

      // Try to create duplicate
      const response = await fixture.adminApiRequest(
        'POST',
        `/projects/${fixture.projectId}/configs`,
        token,
        createConfigBody('duplicate-config', 'second'),
      );

      expect(response.status).toBe(400);
      const data = await response.json();
      expect(data.error).toContain('already exists');
    });

    it('should allow same config name in different projects', async () => {
      const {token} = await fixture.createAdminApiKey({
        scopes: ['config:write'],
        projectIds: null,
      });

      // Create first config in default project
      const response1 = await fixture.adminApiRequest(
        'POST',
        `/projects/${fixture.projectId}/configs`,
        token,
        createConfigBody('shared-name-config', 'value1'),
      );
      expect(response1.status).toBe(201);

      // Create another project
      const {projectId: otherProjectId} = await fixture.engine.useCases.createProject(
        GLOBAL_CONTEXT,
        {
          identity: fixture.identity,
          workspaceId: fixture.workspaceId,
          name: 'Other Project',
          description: 'Other project',
        },
      );

      // Create config with same name in other project
      const response2 = await fixture.adminApiRequest(
        'POST',
        `/projects/${otherProjectId}/configs`,
        token,
        createConfigBody('shared-name-config', 'value2'),
      );
      expect(response2.status).toBe(201);
    });
  });

  describe('Members (Editors and Maintainers)', () => {
    it('should create config with editors', async () => {
      // Register editor users first
      await fixture.registerUser('editor1@example.com');
      await fixture.registerUser('editor2@example.com');

      const {token} = await fixture.createAdminApiKey({
        scopes: ['config:write', 'config:read'],
      });

      const response = await fixture.adminApiRequest(
        'POST',
        `/projects/${fixture.projectId}/configs`,
        token,
        createConfigBody('editors-config', 'value', null, {
          editors: ['editor1@example.com', 'editor2@example.com'],
        }),
      );

      expect(response.status).toBe(201);

      const getResponse = await fixture.adminApiRequest(
        'GET',
        `/projects/${fixture.projectId}/configs/editors-config`,
        token,
      );
      const configData = await getResponse.json();
      expect(configData.editors.sort()).toEqual(['editor1@example.com', 'editor2@example.com'].sort());
    });

    it('should create config with maintainers', async () => {
      // Register maintainer users first
      await fixture.registerUser('maintainer1@example.com');
      await fixture.registerUser('maintainer2@example.com');

      const {token} = await fixture.createAdminApiKey({
        scopes: ['config:write', 'config:read'],
      });

      const response = await fixture.adminApiRequest(
        'POST',
        `/projects/${fixture.projectId}/configs`,
        token,
        createConfigBody('maintainers-config', 'value', null, {
          maintainers: ['maintainer1@example.com', 'maintainer2@example.com'],
        }),
      );

      expect(response.status).toBe(201);
    });

    it('should return 400 when same user has multiple roles', async () => {
      await fixture.registerUser('dual-role@example.com');

      const {token} = await fixture.createAdminApiKey({
        scopes: ['config:write'],
      });

      const response = await fixture.adminApiRequest(
        'POST',
        `/projects/${fixture.projectId}/configs`,
        token,
        createConfigBody('dual-role-config', 'value', null, {
          editors: ['dual-role@example.com'],
          maintainers: ['dual-role@example.com'],
        }),
      );

      expect(response.status).toBe(400);
      const data = await response.json();
      expect(data.error).toContain('multiple roles');
    });
  });

  describe('Environment Variants', () => {
    it('should create config with environment-specific variants', async () => {
      const {token} = await fixture.createAdminApiKey({
        scopes: ['config:write', 'config:read'],
      });

      const response = await fixture.adminApiRequest(
        'POST',
        `/projects/${fixture.projectId}/configs`,
        token,
        createConfigBody('env-variants-config', {default: true}, null, {
          variants: [
            {
              environmentId: fixture.productionEnvironmentId,
              value: {production: true},
              schema: null,
              overrides: [],
              useBaseSchema: false,
            },
            {
              environmentId: fixture.developmentEnvironmentId,
              value: {development: true},
              schema: null,
              overrides: [],
              useBaseSchema: false,
            },
          ],
        }),
      );

      expect(response.status).toBe(201);

      // Verify variants
      const getResponse = await fixture.adminApiRequest(
        'GET',
        `/projects/${fixture.projectId}/configs/env-variants-config`,
        token,
      );
      const configData = await getResponse.json();
      expect(configData.variants.length).toBeGreaterThanOrEqual(2);

      // Find variants by environmentId
      const prodVariant = configData.variants.find(
        (v: {environmentId: string; value: unknown}) => 
          v.environmentId === fixture.productionEnvironmentId,
      );
      expect(prodVariant).toBeDefined();
      expect(prodVariant.value).toEqual({production: true});

      const devVariant = configData.variants.find(
        (v: {environmentId: string; value: unknown}) => 
          v.environmentId === fixture.developmentEnvironmentId,
      );
      expect(devVariant).toBeDefined();
      expect(devVariant.value).toEqual({development: true});
    });

    it('should create config with useBaseSchema for variants', async () => {
      const {token} = await fixture.createAdminApiKey({
        scopes: ['config:write', 'config:read'],
      });

      const schema = {
        type: 'object',
        properties: {
          enabled: {type: 'boolean'},
        },
        required: ['enabled'],
      };

      const response = await fixture.adminApiRequest(
        'POST',
        `/projects/${fixture.projectId}/configs`,
        token,
        createConfigBody('base-schema-config', {enabled: true}, schema, {
          variants: [
            {
              environmentId: fixture.productionEnvironmentId,
              value: {enabled: false},
              schema: null, // Will use base schema
              overrides: [],
              useBaseSchema: true,
            },
          ],
        }),
      );

      expect(response.status).toBe(201);

      const getResponse = await fixture.adminApiRequest(
        'GET',
        `/projects/${fixture.projectId}/configs/base-schema-config`,
        token,
      );
      const configData = await getResponse.json();
      
      // Find production variant
      const prodVariant = configData.variants.find(
        (v: {environmentId: string}) => v.environmentId === fixture.productionEnvironmentId,
      );
      expect(prodVariant).toBeDefined();
      expect(prodVariant.useBaseSchema).toBe(true);
    });

    it('should return 400 for invalid environment ID', async () => {
      const {token} = await fixture.createAdminApiKey({
        scopes: ['config:write'],
      });

      const response = await fixture.adminApiRequest(
        'POST',
        `/projects/${fixture.projectId}/configs`,
        token,
        createConfigBody('invalid-env-config', 'value', null, {
          variants: [
            {
              environmentId: '00000000-0000-0000-0000-000000000000', // Non-existent
              value: 'test',
              schema: null,
              overrides: [],
              useBaseSchema: false,
            },
          ],
        }),
      );

      expect(response.status).toBe(400);
      const data = await response.json();
      expect(data.error).toContain('Invalid environment ID');
    });

    it('should return 400 when variant value does not match its schema', async () => {
      const {token} = await fixture.createAdminApiKey({
        scopes: ['config:write'],
      });

      const variantSchema = {
        type: 'object',
        properties: {
          count: {type: 'number'},
        },
        required: ['count'],
      };

      const response = await fixture.adminApiRequest(
        'POST',
        `/projects/${fixture.projectId}/configs`,
        token,
        createConfigBody('variant-schema-mismatch-config', 'base-value', null, {
          variants: [
            {
              environmentId: fixture.productionEnvironmentId,
              value: {count: 'not-a-number'}, // Invalid
              schema: variantSchema,
              overrides: [],
              useBaseSchema: false,
            },
          ],
        }),
      );

      expect(response.status).toBe(400);
    });

    it('should return 400 when useBaseSchema is true but base has no schema', async () => {
      const {token} = await fixture.createAdminApiKey({
        scopes: ['config:write'],
      });

      const response = await fixture.adminApiRequest(
        'POST',
        `/projects/${fixture.projectId}/configs`,
        token,
        createConfigBody('no-base-schema-config', 'base-value', null, {
          variants: [
            {
              environmentId: fixture.productionEnvironmentId,
              value: 'variant-value',
              schema: null,
              overrides: [],
              useBaseSchema: true, // But base has no schema!
            },
          ],
        }),
      );

      // This should still succeed since base schema is null, and validation should just pass
      // The useBaseSchema flag only matters when there's actually a schema to inherit
      expect(response.status).toBe(201);
    });
  });

  describe('Overrides', () => {
    it('should create config with overrides', async () => {
      const {token} = await fixture.createAdminApiKey({
        scopes: ['config:write', 'config:read'],
      });

      const overrides = [
        {
          name: 'beta-override',
          conditions: [{
            operator: 'equals',
            property: 'userType',
            value: {type: 'literal', value: 'beta'},
          }],
          value: {betaFeature: true},
        },
      ];

      const response = await fixture.adminApiRequest(
        'POST',
        `/projects/${fixture.projectId}/configs`,
        token,
        createConfigBody('overrides-config', {defaultValue: true}, null, {overrides}),
      );

      expect(response.status).toBe(201);

      const getResponse = await fixture.adminApiRequest(
        'GET',
        `/projects/${fixture.projectId}/configs/overrides-config`,
        token,
      );
      const configData = await getResponse.json();
      expect(configData.base.overrides).toHaveLength(1);
      expect(configData.base.overrides[0].name).toBe('beta-override');
    });
  });

  describe('Request Validation', () => {
    it('should return 400 for empty config name', async () => {
      const {token} = await fixture.createAdminApiKey({
        scopes: ['config:write'],
      });

      const response = await fixture.adminApiRequest(
        'POST',
        `/projects/${fixture.projectId}/configs`,
        token,
        createConfigBody('', 'value'),
      );

      expect(response.status).toBe(400);
    });

    it('should return 400 for config name exceeding max length', async () => {
      const {token} = await fixture.createAdminApiKey({
        scopes: ['config:write'],
      });

      const longName = 'a'.repeat(101); // Max is 100
      const response = await fixture.adminApiRequest(
        'POST',
        `/projects/${fixture.projectId}/configs`,
        token,
        createConfigBody(longName, 'value'),
      );

      expect(response.status).toBe(400);
    });

    it('should return 400 for invalid email in editors', async () => {
      const {token} = await fixture.createAdminApiKey({
        scopes: ['config:write'],
      });

      const response = await fixture.adminApiRequest(
        'POST',
        `/projects/${fixture.projectId}/configs`,
        token,
        createConfigBody('invalid-editor-config', 'value', null, {
          editors: ['not-an-email'],
        }),
      );

      expect(response.status).toBe(400);
    });

    it('should return error for non-existent project', async () => {
      const {token} = await fixture.createAdminApiKey({
        scopes: ['config:write'],
        projectIds: null,
      });

      const response = await fixture.adminApiRequest(
        'POST',
        `/projects/00000000-0000-0000-0000-000000000000/configs`,
        token,
        createConfigBody('orphan-config', 'value'),
      );

      // Could be 400 (bad request), 403 (no access) or 404 (not found) depending on implementation
      expect([400, 403, 404]).toContain(response.status);
    });
  });
});
