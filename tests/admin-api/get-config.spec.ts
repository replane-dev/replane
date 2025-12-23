import {GLOBAL_CONTEXT} from '@/engine/core/context';
import {describe, expect, it} from 'vitest';
import {useAppFixture} from '../fixtures/app-fixture';

const CURRENT_USER_EMAIL = 'test@example.com';

describe('Admin API - Get Config', () => {
  const fixture = useAppFixture({authEmail: CURRENT_USER_EMAIL});

  const createConfigBody = (
    name: string,
    value: unknown,
    options: {
      description?: string;
      schema?: unknown;
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
    description: options.description ?? 'Test config',
    editors: options.editors ?? [],
    maintainers: options.maintainers ?? [],
    base: {
      value,
      schema: options.schema ?? null,
      overrides: options.overrides ?? [],
    },
    variants: options.variants ?? [],
  });

  describe('Authorization', () => {
    it('should get config details with config:read scope', async () => {
      const {token} = await fixture.createAdminApiKey({
        scopes: ['config:write', 'config:read'],
      });

      // Create a config
      await fixture.adminApiRequest(
        'POST',
        `/projects/${fixture.projectId}/configs`,
        token,
        createConfigBody('read-auth-config', {key: 'value', nested: {data: 123}}, {
          description: 'Test config description',
        }),
      );

      const response = await fixture.adminApiRequest(
        'GET',
        `/projects/${fixture.projectId}/configs/read-auth-config`,
        token,
      );

      expect(response.status).toBe(200);
      const data = await response.json();
      expect(data.name).toBe('read-auth-config');
      expect(data.description).toBe('Test config description');
      expect(data.base.value).toEqual({key: 'value', nested: {data: 123}});
      expect(data.version).toBe(1);
      expect(data.id).toBeDefined();
      expect(data.createdAt).toBeDefined();
      expect(data.updatedAt).toBeDefined();
    });

    it('should return 403 without config:read scope', async () => {
      const writeToken = (
        await fixture.createAdminApiKey({
          scopes: ['config:write'],
        })
      ).token;

      await fixture.adminApiRequest(
        'POST',
        `/projects/${fixture.projectId}/configs`,
        writeToken,
        createConfigBody('no-read-scope-config', 'value'),
      );

      const {token: noReadToken} = await fixture.createAdminApiKey({
        scopes: ['project:read'],
      });

      const response = await fixture.adminApiRequest(
        'GET',
        `/projects/${fixture.projectId}/configs/no-read-scope-config`,
        noReadToken,
      );

      expect(response.status).toBe(403);
    });

    it('should return 403 when API key does not have project access', async () => {
      const writeToken = (
        await fixture.createAdminApiKey({
          scopes: ['config:write'],
        })
      ).token;

      await fixture.adminApiRequest(
        'POST',
        `/projects/${fixture.projectId}/configs`,
        writeToken,
        createConfigBody('project-restricted-read-config', 'value'),
      );

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
      const {token: restrictedToken} = await fixture.createAdminApiKey({
        scopes: ['config:read'],
        projectIds: [otherProjectId],
      });

      const response = await fixture.adminApiRequest(
        'GET',
        `/projects/${fixture.projectId}/configs/project-restricted-read-config`,
        restrictedToken,
      );

      expect(response.status).toBe(403);
    });

    it('should allow read with unrestricted project access', async () => {
      const {token} = await fixture.createAdminApiKey({
        scopes: ['config:write', 'config:read'],
        projectIds: null,
      });

      await fixture.adminApiRequest(
        'POST',
        `/projects/${fixture.projectId}/configs`,
        token,
        createConfigBody('unrestricted-read-config', 'value'),
      );

      const response = await fixture.adminApiRequest(
        'GET',
        `/projects/${fixture.projectId}/configs/unrestricted-read-config`,
        token,
      );

      expect(response.status).toBe(200);
    });
  });

  describe('Not Found', () => {
    it('should return 404 for non-existent config', async () => {
      const {token} = await fixture.createAdminApiKey({
        scopes: ['config:read'],
      });

      const response = await fixture.adminApiRequest(
        'GET',
        `/projects/${fixture.projectId}/configs/non-existent-config`,
        token,
      );

      expect(response.status).toBe(404);
      const data = await response.json();
      expect(data.error).toBe('Config not found');
    });

    it('should return 404 for config in different project', async () => {
      const {token} = await fixture.createAdminApiKey({
        scopes: ['config:write', 'config:read'],
        projectIds: null,
      });

      // Create config in first project
      await fixture.adminApiRequest(
        'POST',
        `/projects/${fixture.projectId}/configs`,
        token,
        createConfigBody('project1-config', 'value'),
      );

      // Create second project
      const {projectId: project2Id} = await fixture.engine.useCases.createProject(GLOBAL_CONTEXT, {
        identity: fixture.identity,
        workspaceId: fixture.workspaceId,
        name: 'Project 2',
        description: 'Second project',
      });

      // Try to get config from first project using second project's path
      const response = await fixture.adminApiRequest(
        'GET',
        `/projects/${project2Id}/configs/project1-config`,
        token,
      );

      expect(response.status).toBe(404);
    });
  });

  describe('Value Types', () => {
    it('should get config with string value', async () => {
      const {token} = await fixture.createAdminApiKey({
        scopes: ['config:write', 'config:read'],
      });

      await fixture.adminApiRequest(
        'POST',
        `/projects/${fixture.projectId}/configs`,
        token,
        createConfigBody('string-value-config', 'simple string value'),
      );

      const response = await fixture.adminApiRequest(
        'GET',
        `/projects/${fixture.projectId}/configs/string-value-config`,
        token,
      );

      expect(response.status).toBe(200);
      const data = await response.json();
      expect(data.base.value).toBe('simple string value');
    });

    it('should get config with number value', async () => {
      const {token} = await fixture.createAdminApiKey({
        scopes: ['config:write', 'config:read'],
      });

      await fixture.adminApiRequest(
        'POST',
        `/projects/${fixture.projectId}/configs`,
        token,
        createConfigBody('number-value-config', 42.5),
      );

      const response = await fixture.adminApiRequest(
        'GET',
        `/projects/${fixture.projectId}/configs/number-value-config`,
        token,
      );

      expect(response.status).toBe(200);
      const data = await response.json();
      expect(data.base.value).toBe(42.5);
    });

    it('should get config with boolean value', async () => {
      const {token} = await fixture.createAdminApiKey({
        scopes: ['config:write', 'config:read'],
      });

      await fixture.adminApiRequest(
        'POST',
        `/projects/${fixture.projectId}/configs`,
        token,
        createConfigBody('boolean-value-config', false),
      );

      const response = await fixture.adminApiRequest(
        'GET',
        `/projects/${fixture.projectId}/configs/boolean-value-config`,
        token,
      );

      expect(response.status).toBe(200);
      const data = await response.json();
      expect(data.base.value).toBe(false);
    });

    it('should get config with null value', async () => {
      const {token} = await fixture.createAdminApiKey({
        scopes: ['config:write', 'config:read'],
      });

      await fixture.adminApiRequest(
        'POST',
        `/projects/${fixture.projectId}/configs`,
        token,
        createConfigBody('null-value-config', null),
      );

      const response = await fixture.adminApiRequest(
        'GET',
        `/projects/${fixture.projectId}/configs/null-value-config`,
        token,
      );

      expect(response.status).toBe(200);
      const data = await response.json();
      expect(data.base.value).toBeNull();
    });

    it('should get config with array value', async () => {
      const {token} = await fixture.createAdminApiKey({
        scopes: ['config:write', 'config:read'],
      });

      await fixture.adminApiRequest(
        'POST',
        `/projects/${fixture.projectId}/configs`,
        token,
        createConfigBody('array-value-config', [1, 'two', {three: 3}, [4, 5]]),
      );

      const response = await fixture.adminApiRequest(
        'GET',
        `/projects/${fixture.projectId}/configs/array-value-config`,
        token,
      );

      expect(response.status).toBe(200);
      const data = await response.json();
      expect(data.base.value).toEqual([1, 'two', {three: 3}, [4, 5]]);
    });

    it('should get config with complex nested object value', async () => {
      const {token} = await fixture.createAdminApiKey({
        scopes: ['config:write', 'config:read'],
      });

      const complexValue = {
        level1: {
          level2: {
            level3: {
              data: 'deeply nested',
              numbers: [1, 2, 3],
            },
          },
          array: [{key: 'value1'}, {key: 'value2'}],
        },
        flags: {
          enabled: true,
          disabled: false,
        },
      };

      await fixture.adminApiRequest(
        'POST',
        `/projects/${fixture.projectId}/configs`,
        token,
        createConfigBody('nested-object-config', complexValue),
      );

      const response = await fixture.adminApiRequest(
        'GET',
        `/projects/${fixture.projectId}/configs/nested-object-config`,
        token,
      );

      expect(response.status).toBe(200);
      const data = await response.json();
      expect(data.base.value).toEqual(complexValue);
    });
  });

  describe('Schema', () => {
    it('should return schema when present', async () => {
      const {token} = await fixture.createAdminApiKey({
        scopes: ['config:write', 'config:read'],
      });

      const schema = {
        type: 'object',
        properties: {
          enabled: {type: 'boolean'},
          count: {type: 'integer', minimum: 0},
        },
        required: ['enabled'],
      };

      await fixture.adminApiRequest(
        'POST',
        `/projects/${fixture.projectId}/configs`,
        token,
        createConfigBody('schema-read-config', {enabled: true, count: 5}, {schema}),
      );

      const response = await fixture.adminApiRequest(
        'GET',
        `/projects/${fixture.projectId}/configs/schema-read-config`,
        token,
      );

      expect(response.status).toBe(200);
      const data = await response.json();
      expect(data.base.schema).toEqual(schema);
    });

    it('should return null schema when not present', async () => {
      const {token} = await fixture.createAdminApiKey({
        scopes: ['config:write', 'config:read'],
      });

      await fixture.adminApiRequest(
        'POST',
        `/projects/${fixture.projectId}/configs`,
        token,
        createConfigBody('no-schema-config', {any: 'value'}),
      );

      const response = await fixture.adminApiRequest(
        'GET',
        `/projects/${fixture.projectId}/configs/no-schema-config`,
        token,
      );

      expect(response.status).toBe(200);
      const data = await response.json();
      expect(data.base.schema).toBeNull();
    });
  });

  describe('Editors', () => {
    it('should return editors list', async () => {
      await fixture.registerUser('editor1@example.com');
      await fixture.registerUser('editor2@example.com');

      const {token} = await fixture.createAdminApiKey({
        scopes: ['config:write', 'config:read'],
      });

      await fixture.adminApiRequest(
        'POST',
        `/projects/${fixture.projectId}/configs`,
        token,
        createConfigBody('editors-read-config', 'value', {
          editors: ['editor1@example.com', 'editor2@example.com'],
        }),
      );

      const response = await fixture.adminApiRequest(
        'GET',
        `/projects/${fixture.projectId}/configs/editors-read-config`,
        token,
      );

      expect(response.status).toBe(200);
      const data = await response.json();
      expect(data.editors.sort()).toEqual(['editor1@example.com', 'editor2@example.com'].sort());
    });

    it('should return empty editors array when none set', async () => {
      const {token} = await fixture.createAdminApiKey({
        scopes: ['config:write', 'config:read'],
      });

      await fixture.adminApiRequest(
        'POST',
        `/projects/${fixture.projectId}/configs`,
        token,
        createConfigBody('no-editors-config', 'value'),
      );

      const response = await fixture.adminApiRequest(
        'GET',
        `/projects/${fixture.projectId}/configs/no-editors-config`,
        token,
      );

      expect(response.status).toBe(200);
      const data = await response.json();
      expect(data.editors).toEqual([]);
    });
  });

  describe('Environment Variants', () => {
    it('should return environment variants', async () => {
      const {token} = await fixture.createAdminApiKey({
        scopes: ['config:write', 'config:read'],
      });

      await fixture.adminApiRequest(
        'POST',
        `/projects/${fixture.projectId}/configs`,
        token,
        createConfigBody('variants-read-config', {base: true}, {
          variants: [
            {
              environmentId: fixture.productionEnvironmentId,
              value: {production: true, env: 'prod'},
              schema: null,
              overrides: [],
              useBaseSchema: false,
            },
            {
              environmentId: fixture.developmentEnvironmentId,
              value: {development: true, env: 'dev'},
              schema: null,
              overrides: [],
              useBaseSchema: false,
            },
          ],
        }),
      );

      const response = await fixture.adminApiRequest(
        'GET',
        `/projects/${fixture.projectId}/configs/variants-read-config`,
        token,
      );

      expect(response.status).toBe(200);
      const data = await response.json();

      expect(data.variants).toHaveLength(2);

      const prodVariant = data.variants.find(
        (v: {environmentId: string}) => v.environmentId === fixture.productionEnvironmentId,
      );
      expect(prodVariant).toBeDefined();
      expect(prodVariant.value).toEqual({production: true, env: 'prod'});

      const devVariant = data.variants.find(
        (v: {environmentId: string}) => v.environmentId === fixture.developmentEnvironmentId,
      );
      expect(devVariant).toBeDefined();
      expect(devVariant.value).toEqual({development: true, env: 'dev'});
    });

    it('should return variant with useBaseSchema flag', async () => {
      const {token} = await fixture.createAdminApiKey({
        scopes: ['config:write', 'config:read'],
      });

      const schema = {
        type: 'object',
        properties: {enabled: {type: 'boolean'}},
      };

      await fixture.adminApiRequest(
        'POST',
        `/projects/${fixture.projectId}/configs`,
        token,
        createConfigBody('use-base-schema-read-config', {enabled: true}, {
          schema,
          variants: [
            {
              environmentId: fixture.productionEnvironmentId,
              value: {enabled: false},
              schema: null,
              overrides: [],
              useBaseSchema: true,
            },
          ],
        }),
      );

      const response = await fixture.adminApiRequest(
        'GET',
        `/projects/${fixture.projectId}/configs/use-base-schema-read-config`,
        token,
      );

      expect(response.status).toBe(200);
      const data = await response.json();

      const prodVariant = data.variants.find(
        (v: {environmentId: string}) => v.environmentId === fixture.productionEnvironmentId,
      );
      expect(prodVariant.useBaseSchema).toBe(true);
    });

    it('should return variant with its own schema', async () => {
      const {token} = await fixture.createAdminApiKey({
        scopes: ['config:write', 'config:read'],
      });

      const variantSchema = {
        type: 'object',
        properties: {variant_specific: {type: 'string'}},
      };

      await fixture.adminApiRequest(
        'POST',
        `/projects/${fixture.projectId}/configs`,
        token,
        createConfigBody('variant-schema-read-config', {base: true}, {
          variants: [
            {
              environmentId: fixture.productionEnvironmentId,
              value: {variant_specific: 'prod-value'},
              schema: variantSchema,
              overrides: [],
              useBaseSchema: false,
            },
          ],
        }),
      );

      const response = await fixture.adminApiRequest(
        'GET',
        `/projects/${fixture.projectId}/configs/variant-schema-read-config`,
        token,
      );

      expect(response.status).toBe(200);
      const data = await response.json();

      const prodVariant = data.variants.find(
        (v: {environmentId: string}) => v.environmentId === fixture.productionEnvironmentId,
      );
      expect(prodVariant.schema).toEqual(variantSchema);
      expect(prodVariant.useBaseSchema).toBe(false);
    });
  });

  describe('Overrides', () => {
    it('should return base overrides', async () => {
      const {token} = await fixture.createAdminApiKey({
        scopes: ['config:write', 'config:read'],
      });

      const overrides = [
        {
          name: 'beta-override',
          conditions: [{operator: 'equals', property: 'userType', value: {type: 'literal', value: 'beta'}}],
          value: {beta: true},
        },
        {
          name: 'premium-override',
          conditions: [{operator: 'equals', property: 'userType', value: {type: 'literal', value: 'premium'}}],
          value: {premium: true},
        },
      ];

      await fixture.adminApiRequest(
        'POST',
        `/projects/${fixture.projectId}/configs`,
        token,
        createConfigBody('overrides-read-config', {default: true}, {overrides}),
      );

      const response = await fixture.adminApiRequest(
        'GET',
        `/projects/${fixture.projectId}/configs/overrides-read-config`,
        token,
      );

      expect(response.status).toBe(200);
      const data = await response.json();
      expect(data.base.overrides).toHaveLength(2);
      expect(data.base.overrides[0].name).toBe('beta-override');
      expect(data.base.overrides[1].name).toBe('premium-override');
    });

    it('should return empty overrides array when none set', async () => {
      const {token} = await fixture.createAdminApiKey({
        scopes: ['config:write', 'config:read'],
      });

      await fixture.adminApiRequest(
        'POST',
        `/projects/${fixture.projectId}/configs`,
        token,
        createConfigBody('no-overrides-config', 'value'),
      );

      const response = await fixture.adminApiRequest(
        'GET',
        `/projects/${fixture.projectId}/configs/no-overrides-config`,
        token,
      );

      expect(response.status).toBe(200);
      const data = await response.json();
      expect(data.base.overrides).toEqual([]);
    });

    it('should return variant-specific overrides', async () => {
      const {token} = await fixture.createAdminApiKey({
        scopes: ['config:write', 'config:read'],
      });

      await fixture.adminApiRequest(
        'POST',
        `/projects/${fixture.projectId}/configs`,
        token,
        createConfigBody('variant-overrides-config', {base: true}, {
          variants: [
            {
              environmentId: fixture.productionEnvironmentId,
              value: {production: true},
              schema: null,
              overrides: [
                {
                  name: 'prod-override',
                  conditions: [{operator: 'equals', property: 'env', value: {type: 'literal', value: 'prod'}}],
                  value: {prod_override: true},
                },
              ],
              useBaseSchema: false,
            },
          ],
        }),
      );

      const response = await fixture.adminApiRequest(
        'GET',
        `/projects/${fixture.projectId}/configs/variant-overrides-config`,
        token,
      );

      expect(response.status).toBe(200);
      const data = await response.json();

      const prodVariant = data.variants.find(
        (v: {environmentId: string}) => v.environmentId === fixture.productionEnvironmentId,
      );
      expect(prodVariant.overrides).toHaveLength(1);
      expect(prodVariant.overrides[0].name).toBe('prod-override');
    });
  });

  describe('Metadata', () => {
    it('should return all expected fields', async () => {
      const {token} = await fixture.createAdminApiKey({
        scopes: ['config:write', 'config:read'],
      });

      await fixture.adminApiRequest(
        'POST',
        `/projects/${fixture.projectId}/configs`,
        token,
        createConfigBody('metadata-config', 'value', {description: 'Test description'}),
      );

      const response = await fixture.adminApiRequest(
        'GET',
        `/projects/${fixture.projectId}/configs/metadata-config`,
        token,
      );

      expect(response.status).toBe(200);
      const data = await response.json();

      // Check all expected fields are present
      expect(data).toHaveProperty('id');
      expect(data).toHaveProperty('name', 'metadata-config');
      expect(data).toHaveProperty('description', 'Test description');
      expect(data).toHaveProperty('version', 1);
      expect(data).toHaveProperty('createdAt');
      expect(data).toHaveProperty('updatedAt');
      expect(data).toHaveProperty('editors');
      expect(data).toHaveProperty('base');
      expect(data.base).toHaveProperty('value', 'value');
      expect(data.base).toHaveProperty('schema');
      expect(data.base).toHaveProperty('overrides');
      expect(data).toHaveProperty('variants');

      // Check timestamp format
      expect(data.createdAt).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/);
      expect(data.updatedAt).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/);

      // Check ID format (UUID)
      expect(data.id).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i);
    });

    it('should reflect version after updates', async () => {
      const {token} = await fixture.createAdminApiKey({
        scopes: ['config:write', 'config:read'],
      });

      await fixture.adminApiRequest(
        'POST',
        `/projects/${fixture.projectId}/configs`,
        token,
        createConfigBody('version-check-config', 'v1'),
      );

      // Update twice
      await fixture.adminApiRequest(
        'PUT',
        `/projects/${fixture.projectId}/configs/version-check-config`,
        token,
        {description: 'Updated', editors: [], base: {value: 'v2', schema: null, overrides: []}, variants: []},
      );
      await fixture.adminApiRequest(
        'PUT',
        `/projects/${fixture.projectId}/configs/version-check-config`,
        token,
        {description: 'Updated again', editors: [], base: {value: 'v3', schema: null, overrides: []}, variants: []},
      );

      const response = await fixture.adminApiRequest(
        'GET',
        `/projects/${fixture.projectId}/configs/version-check-config`,
        token,
      );

      expect(response.status).toBe(200);
      const data = await response.json();
      expect(data.version).toBe(3);
      expect(data.base.value).toBe('v3');
    });
  });
});
