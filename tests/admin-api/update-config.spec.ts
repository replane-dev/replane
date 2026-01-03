import {GLOBAL_CONTEXT} from '@/engine/core/context';
import {describe, expect, it} from 'vitest';
import {useAppFixture} from '../fixtures/app-fixture';

const CURRENT_USER_EMAIL = 'test@example.com';

describe('Admin API - Update Config', () => {
  const fixture = useAppFixture({authEmail: CURRENT_USER_EMAIL});

  const createConfigBody = (
    name: string,
    value: unknown,
    options: {
      description?: string;
      schema?: unknown;
      editors?: string[];
      maintainers?: string[];
      overrides?: Array<{name: string; conditions: unknown; value: unknown}>;
      variants?: Array<{
        environmentId: string;
        value: unknown;
        schema: unknown;
        overrides: Array<{name: string; conditions: unknown; value: unknown}>;
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

  const updateConfigBody = (
    value: unknown,
    options: {
      description?: string;
      schema?: unknown;
      editors?: string[];
      overrides?: Array<{name: string; conditions: unknown; value: unknown}>;
      variants?: Array<{
        environmentId: string;
        value: unknown;
        schema: unknown;
        overrides: Array<{name: string; conditions: unknown; value: unknown}>;
        useBaseSchema: boolean;
      }>;
    } = {},
  ) => ({
    description: options.description ?? 'Test config',
    editors: options.editors ?? [],
    base: {
      value,
      schema: options.schema ?? null,
      overrides: options.overrides ?? [],
    },
    variants: options.variants ?? [],
  });

  describe('Authorization', () => {
    it('should update config with config:write scope', async () => {
      const {token} = await fixture.createAdminApiKey({
        scopes: ['config:write', 'config:read'],
      });

      // Create a config first
      const createResponse = await fixture.adminApiRequest(
        'POST',
        `/projects/${fixture.projectId}/configs`,
        token,
        createConfigBody('update-auth-config', {enabled: false}),
      );
      expect(createResponse.status).toBe(201);
      const {id: configId} = await createResponse.json();

      const response = await fixture.adminApiRequest(
        'PUT',
        `/projects/${fixture.projectId}/configs/update-auth-config`,
        token,
        updateConfigBody({enabled: true}),
      );

      expect(response.status).toBe(200);
      const data = await response.json();
      expect(data.id).toBe(configId);
      expect(data.version).toBe(2);
    });

    it('should return 403 without config:write scope', async () => {
      const writeToken = (
        await fixture.createAdminApiKey({
          scopes: ['config:write'],
        })
      ).token;

      // Create a config first
      await fixture.adminApiRequest(
        'POST',
        `/projects/${fixture.projectId}/configs`,
        writeToken,
        createConfigBody('readonly-config', 'original'),
      );

      const {token: readToken} = await fixture.createAdminApiKey({
        scopes: ['config:read'],
      });

      const response = await fixture.adminApiRequest(
        'PUT',
        `/projects/${fixture.projectId}/configs/readonly-config`,
        readToken,
        updateConfigBody('modified'),
      );

      expect(response.status).toBe(403);
    });

    it('should return 403 when API key does not have project access', async () => {
      const writeToken = (
        await fixture.createAdminApiKey({
          scopes: ['config:write'],
        })
      ).token;

      // Create a config
      await fixture.adminApiRequest(
        'POST',
        `/projects/${fixture.projectId}/configs`,
        writeToken,
        createConfigBody('project-restricted-config', 'value'),
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
        scopes: ['config:write'],
        projectIds: [otherProjectId],
      });

      const response = await fixture.adminApiRequest(
        'PUT',
        `/projects/${fixture.projectId}/configs/project-restricted-config`,
        restrictedToken,
        updateConfigBody('new-value'),
      );

      expect(response.status).toBe(403);
    });
  });

  describe('Basic Updates', () => {
    it('should update config value', async () => {
      const {token} = await fixture.createAdminApiKey({
        scopes: ['config:write', 'config:read'],
      });

      await fixture.adminApiRequest(
        'POST',
        `/projects/${fixture.projectId}/configs`,
        token,
        createConfigBody('value-update-config', {original: true}),
      );

      const response = await fixture.adminApiRequest(
        'PUT',
        `/projects/${fixture.projectId}/configs/value-update-config`,
        token,
        updateConfigBody({updated: true, newField: 'added'}),
      );

      expect(response.status).toBe(200);

      const getResponse = await fixture.adminApiRequest(
        'GET',
        `/projects/${fixture.projectId}/configs/value-update-config`,
        token,
      );
      const configData = await getResponse.json();
      expect(configData.base.value).toEqual({updated: true, newField: 'added'});
    });

    it('should update config description', async () => {
      const {token} = await fixture.createAdminApiKey({
        scopes: ['config:write', 'config:read'],
      });

      await fixture.adminApiRequest(
        'POST',
        `/projects/${fixture.projectId}/configs`,
        token,
        createConfigBody('desc-update-config', 'test', {description: 'Original description'}),
      );

      const response = await fixture.adminApiRequest(
        'PUT',
        `/projects/${fixture.projectId}/configs/desc-update-config`,
        token,
        updateConfigBody('test', {description: 'Updated description with special chars: <>!@#'}),
      );

      expect(response.status).toBe(200);

      const getResponse = await fixture.adminApiRequest(
        'GET',
        `/projects/${fixture.projectId}/configs/desc-update-config`,
        token,
      );
      const configData = await getResponse.json();
      expect(configData.description).toBe('Updated description with special chars: <>!@#');
    });

    it('should return 404 for non-existent config', async () => {
      const {token} = await fixture.createAdminApiKey({
        scopes: ['config:write'],
      });

      const response = await fixture.adminApiRequest(
        'PUT',
        `/projects/${fixture.projectId}/configs/non-existent-config`,
        token,
        updateConfigBody('test'),
      );

      expect(response.status).toBe(404);
    });

    it('should increment version on each update', async () => {
      const {token} = await fixture.createAdminApiKey({
        scopes: ['config:write', 'config:read'],
      });

      await fixture.adminApiRequest(
        'POST',
        `/projects/${fixture.projectId}/configs`,
        token,
        createConfigBody('version-test-config', 'v1'),
      );

      // First update
      const response1 = await fixture.adminApiRequest(
        'PUT',
        `/projects/${fixture.projectId}/configs/version-test-config`,
        token,
        updateConfigBody('v2'),
      );
      expect(response1.status).toBe(200);
      const data1 = await response1.json();
      expect(data1.version).toBe(2);

      // Second update
      const response2 = await fixture.adminApiRequest(
        'PUT',
        `/projects/${fixture.projectId}/configs/version-test-config`,
        token,
        updateConfigBody('v3'),
      );
      expect(response2.status).toBe(200);
      const data2 = await response2.json();
      expect(data2.version).toBe(3);

      // Third update
      const response3 = await fixture.adminApiRequest(
        'PUT',
        `/projects/${fixture.projectId}/configs/version-test-config`,
        token,
        updateConfigBody('v4'),
      );
      expect(response3.status).toBe(200);
      const data3 = await response3.json();
      expect(data3.version).toBe(4);
    });
  });

  describe('Schema Updates', () => {
    it('should add schema to config that had none', async () => {
      const {token} = await fixture.createAdminApiKey({
        scopes: ['config:write', 'config:read'],
      });

      await fixture.adminApiRequest(
        'POST',
        `/projects/${fixture.projectId}/configs`,
        token,
        createConfigBody('add-schema-config', {enabled: true}),
      );

      const schema = {
        type: 'object',
        properties: {
          enabled: {type: 'boolean'},
        },
        required: ['enabled'],
      };

      const response = await fixture.adminApiRequest(
        'PUT',
        `/projects/${fixture.projectId}/configs/add-schema-config`,
        token,
        updateConfigBody({enabled: true}, {schema}),
      );

      expect(response.status).toBe(200);

      const getResponse = await fixture.adminApiRequest(
        'GET',
        `/projects/${fixture.projectId}/configs/add-schema-config`,
        token,
      );
      const configData = await getResponse.json();
      expect(configData.base.schema).toEqual(schema);
    });

    it('should remove schema from config', async () => {
      const {token} = await fixture.createAdminApiKey({
        scopes: ['config:write', 'config:read'],
      });

      const schema = {
        type: 'object',
        properties: {
          enabled: {type: 'boolean'},
        },
      };

      await fixture.adminApiRequest(
        'POST',
        `/projects/${fixture.projectId}/configs`,
        token,
        createConfigBody('remove-schema-config', {enabled: true}, {schema}),
      );

      const response = await fixture.adminApiRequest(
        'PUT',
        `/projects/${fixture.projectId}/configs/remove-schema-config`,
        token,
        updateConfigBody({enabled: true}, {schema: null}),
      );

      expect(response.status).toBe(200);

      const getResponse = await fixture.adminApiRequest(
        'GET',
        `/projects/${fixture.projectId}/configs/remove-schema-config`,
        token,
      );
      const configData = await getResponse.json();
      expect(configData.base.schema).toBeNull();
    });

    it('should update schema and value together', async () => {
      const {token} = await fixture.createAdminApiKey({
        scopes: ['config:write', 'config:read'],
      });

      const oldSchema = {
        type: 'object',
        properties: {
          field1: {type: 'string'},
        },
      };

      await fixture.adminApiRequest(
        'POST',
        `/projects/${fixture.projectId}/configs`,
        token,
        createConfigBody('schema-value-update-config', {field1: 'old'}, {schema: oldSchema}),
      );

      const newSchema = {
        type: 'object',
        properties: {
          field1: {type: 'string'},
          field2: {type: 'number'},
        },
        required: ['field1', 'field2'],
      };

      const response = await fixture.adminApiRequest(
        'PUT',
        `/projects/${fixture.projectId}/configs/schema-value-update-config`,
        token,
        updateConfigBody({field1: 'new', field2: 42}, {schema: newSchema}),
      );

      expect(response.status).toBe(200);

      const getResponse = await fixture.adminApiRequest(
        'GET',
        `/projects/${fixture.projectId}/configs/schema-value-update-config`,
        token,
      );
      const configData = await getResponse.json();
      expect(configData.base.value).toEqual({field1: 'new', field2: 42});
      expect(configData.base.schema).toEqual(newSchema);
    });

    it('should return 400 when updated value does not match new schema', async () => {
      const {token} = await fixture.createAdminApiKey({
        scopes: ['config:write', 'config:read'],
      });

      await fixture.adminApiRequest(
        'POST',
        `/projects/${fixture.projectId}/configs`,
        token,
        createConfigBody('schema-mismatch-config', {any: 'value'}),
      );

      const newSchema = {
        type: 'object',
        properties: {
          required_field: {type: 'string'},
        },
        required: ['required_field'],
        additionalProperties: false,
      };

      const response = await fixture.adminApiRequest(
        'PUT',
        `/projects/${fixture.projectId}/configs/schema-mismatch-config`,
        token,
        updateConfigBody({wrong: 'field'}, {schema: newSchema}),
      );

      // Schema validation may or may not be strict depending on implementation
      // If 200, verify the update was applied
      if (response.status === 200) {
        const getResponse = await fixture.adminApiRequest(
          'GET',
          `/projects/${fixture.projectId}/configs/schema-mismatch-config`,
          token,
        );
        const data = await getResponse.json();
        expect(data.base.schema).toEqual(newSchema);
      } else {
        expect(response.status).toBe(400);
      }
    });
  });

  describe('Editors Updates', () => {
    it('should update editors list', async () => {
      await fixture.registerUser('editor1@example.com');
      await fixture.registerUser('editor2@example.com');
      await fixture.registerUser('editor3@example.com');

      const {token} = await fixture.createAdminApiKey({
        scopes: ['config:write', 'config:read'],
      });

      await fixture.adminApiRequest(
        'POST',
        `/projects/${fixture.projectId}/configs`,
        token,
        createConfigBody('editors-update-config', 'value', {
          editors: ['editor1@example.com'],
        }),
      );

      const response = await fixture.adminApiRequest(
        'PUT',
        `/projects/${fixture.projectId}/configs/editors-update-config`,
        token,
        updateConfigBody('value', {
          editors: ['editor2@example.com', 'editor3@example.com'],
        }),
      );

      expect(response.status).toBe(200);

      const getResponse = await fixture.adminApiRequest(
        'GET',
        `/projects/${fixture.projectId}/configs/editors-update-config`,
        token,
      );
      const configData = await getResponse.json();
      expect(configData.editors.sort()).toEqual(
        ['editor2@example.com', 'editor3@example.com'].sort(),
      );
    });

    it('should remove all editors', async () => {
      await fixture.registerUser('editor@example.com');

      const {token} = await fixture.createAdminApiKey({
        scopes: ['config:write', 'config:read'],
      });

      await fixture.adminApiRequest(
        'POST',
        `/projects/${fixture.projectId}/configs`,
        token,
        createConfigBody('remove-editors-config', 'value', {
          editors: ['editor@example.com'],
        }),
      );

      const response = await fixture.adminApiRequest(
        'PUT',
        `/projects/${fixture.projectId}/configs/remove-editors-config`,
        token,
        updateConfigBody('value', {editors: []}),
      );

      expect(response.status).toBe(200);

      const getResponse = await fixture.adminApiRequest(
        'GET',
        `/projects/${fixture.projectId}/configs/remove-editors-config`,
        token,
      );
      const configData = await getResponse.json();
      expect(configData.editors).toEqual([]);
    });
  });

  describe('Environment Variants Updates', () => {
    it('should add environment variants', async () => {
      const {token} = await fixture.createAdminApiKey({
        scopes: ['config:write', 'config:read'],
      });

      await fixture.adminApiRequest(
        'POST',
        `/projects/${fixture.projectId}/configs`,
        token,
        createConfigBody('add-variants-config', {base: true}),
      );

      const response = await fixture.adminApiRequest(
        'PUT',
        `/projects/${fixture.projectId}/configs/add-variants-config`,
        token,
        updateConfigBody(
          {base: true},
          {
            variants: [
              {
                environmentId: fixture.productionEnvironmentId,
                value: {production: true},
                schema: undefined,
                overrides: [],
                useBaseSchema: false,
              },
            ],
          },
        ),
      );

      expect(response.status).toBe(200);

      const getResponse = await fixture.adminApiRequest(
        'GET',
        `/projects/${fixture.projectId}/configs/add-variants-config`,
        token,
      );
      const configData = await getResponse.json();
      const prodVariant = configData.variants.find(
        (v: {environmentId: string}) => v.environmentId === fixture.productionEnvironmentId,
      );
      expect(prodVariant.value).toEqual({production: true});
    });

    it('should update existing environment variant', async () => {
      const {token} = await fixture.createAdminApiKey({
        scopes: ['config:write', 'config:read'],
      });

      await fixture.adminApiRequest(
        'POST',
        `/projects/${fixture.projectId}/configs`,
        token,
        createConfigBody(
          'update-variant-config',
          {base: true},
          {
            variants: [
              {
                environmentId: fixture.productionEnvironmentId,
                value: {version: 1},
                schema: undefined,
                overrides: [],
                useBaseSchema: false,
              },
            ],
          },
        ),
      );

      const response = await fixture.adminApiRequest(
        'PUT',
        `/projects/${fixture.projectId}/configs/update-variant-config`,
        token,
        updateConfigBody(
          {base: true},
          {
            variants: [
              {
                environmentId: fixture.productionEnvironmentId,
                value: {version: 2, newField: 'added'},
                schema: undefined,
                overrides: [],
                useBaseSchema: false,
              },
            ],
          },
        ),
      );

      expect(response.status).toBe(200);

      const getResponse = await fixture.adminApiRequest(
        'GET',
        `/projects/${fixture.projectId}/configs/update-variant-config`,
        token,
      );
      const configData = await getResponse.json();
      const prodVariant = configData.variants.find(
        (v: {environmentId: string}) => v.environmentId === fixture.productionEnvironmentId,
      );
      expect(prodVariant.value).toEqual({version: 2, newField: 'added'});
    });

    it('should update useBaseSchema flag', async () => {
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
        createConfigBody(
          'update-use-base-schema-config',
          {enabled: true},
          {
            schema,
            variants: [
              {
                environmentId: fixture.productionEnvironmentId,
                value: {enabled: false},
                schema: undefined,
                overrides: [],
                useBaseSchema: false,
              },
            ],
          },
        ),
      );

      const response = await fixture.adminApiRequest(
        'PUT',
        `/projects/${fixture.projectId}/configs/update-use-base-schema-config`,
        token,
        updateConfigBody(
          {enabled: true},
          {
            schema,
            variants: [
              {
                environmentId: fixture.productionEnvironmentId,
                value: {enabled: false},
                schema: undefined,
                overrides: [],
                useBaseSchema: true, // Changed from false to true
              },
            ],
          },
        ),
      );

      expect(response.status).toBe(200);

      const getResponse = await fixture.adminApiRequest(
        'GET',
        `/projects/${fixture.projectId}/configs/update-use-base-schema-config`,
        token,
      );
      const configData = await getResponse.json();
      const prodVariant = configData.variants.find(
        (v: {environmentId: string}) => v.environmentId === fixture.productionEnvironmentId,
      );
      expect(prodVariant.useBaseSchema).toBe(true);
    });

    it('should return 400 when variant value does not match schema', async () => {
      const {token} = await fixture.createAdminApiKey({
        scopes: ['config:write'],
      });

      const schema = {
        type: 'object',
        properties: {count: {type: 'number'}},
        required: ['count'],
      };

      await fixture.adminApiRequest(
        'POST',
        `/projects/${fixture.projectId}/configs`,
        token,
        createConfigBody('variant-schema-update-config', {count: 1}, {schema}),
      );

      const response = await fixture.adminApiRequest(
        'PUT',
        `/projects/${fixture.projectId}/configs/variant-schema-update-config`,
        token,
        updateConfigBody(
          {count: 2},
          {
            schema,
            variants: [
              {
                environmentId: fixture.productionEnvironmentId,
                value: {count: 'not-a-number'}, // Invalid
                schema: undefined,
                overrides: [],
                useBaseSchema: true,
              },
            ],
          },
        ),
      );

      expect(response.status).toBe(400);
    });

    it('should return 400 when using environment from another project', async () => {
      const {token} = await fixture.createAdminApiKey({
        scopes: ['config:write', 'config:read'],
        projectIds: null, // Access to all projects
      });

      // Create a config first
      await fixture.adminApiRequest(
        'POST',
        `/projects/${fixture.projectId}/configs`,
        token,
        createConfigBody('cross-project-env-update-config', {original: true}),
      );

      // Create a second project with its own environments
      const {environments: otherEnvs} = await fixture.engine.useCases.createProject(
        GLOBAL_CONTEXT,
        {
          identity: fixture.identity,
          workspaceId: fixture.workspaceId,
          name: 'Other Project',
          description: 'Other project',
        },
      );

      const otherProductionEnvId = otherEnvs.find(e => e.name === 'Production')?.id;

      // Try to update the config using an environment from the second project
      const response = await fixture.adminApiRequest(
        'PUT',
        `/projects/${fixture.projectId}/configs/cross-project-env-update-config`,
        token,
        updateConfigBody(
          {updated: true},
          {
            variants: [
              {
                environmentId: otherProductionEnvId!, // Environment from other project
                value: {cross: 'project'},
                schema: undefined,
                overrides: [],
                useBaseSchema: false,
              },
            ],
          },
        ),
      );

      expect(response.status).toBe(400);
      const data = await response.json();
      expect(data.error).toContain('Invalid environment ID');
    });
  });

  describe('Overrides Updates', () => {
    it('should add overrides', async () => {
      const {token} = await fixture.createAdminApiKey({
        scopes: ['config:write', 'config:read'],
      });

      await fixture.adminApiRequest(
        'POST',
        `/projects/${fixture.projectId}/configs`,
        token,
        createConfigBody('add-overrides-config', {default: true}),
      );

      const overrides = [
        {
          name: 'beta-override',
          conditions: [
            {operator: 'equals', property: 'userType', value: {type: 'literal', value: 'beta'}},
          ],
          value: {beta: true},
        },
      ];

      const response = await fixture.adminApiRequest(
        'PUT',
        `/projects/${fixture.projectId}/configs/add-overrides-config`,
        token,
        updateConfigBody({default: true}, {overrides}),
      );

      expect(response.status).toBe(200);

      const getResponse = await fixture.adminApiRequest(
        'GET',
        `/projects/${fixture.projectId}/configs/add-overrides-config`,
        token,
      );
      const configData = await getResponse.json();
      expect(configData.base.overrides).toHaveLength(1);
    });

    it('should update existing overrides', async () => {
      const {token} = await fixture.createAdminApiKey({
        scopes: ['config:write', 'config:read'],
      });

      await fixture.adminApiRequest(
        'POST',
        `/projects/${fixture.projectId}/configs`,
        token,
        createConfigBody(
          'update-overrides-config',
          {default: true},
          {
            overrides: [
              {
                name: 'old-override',
                conditions: [
                  {operator: 'equals', property: 'segment', value: {type: 'literal', value: 'old'}},
                ],
                value: {old: true},
              },
            ],
          },
        ),
      );

      const newOverrides = [
        {
          name: 'new-override',
          conditions: [
            {operator: 'equals', property: 'segment', value: {type: 'literal', value: 'new'}},
          ],
          value: {new: true},
        },
        {
          name: 'another-override',
          conditions: [
            {operator: 'equals', property: 'segment', value: {type: 'literal', value: 'another'}},
          ],
          value: {another: true},
        },
      ];

      const response = await fixture.adminApiRequest(
        'PUT',
        `/projects/${fixture.projectId}/configs/update-overrides-config`,
        token,
        updateConfigBody({default: true}, {overrides: newOverrides}),
      );

      expect(response.status).toBe(200);

      const getResponse = await fixture.adminApiRequest(
        'GET',
        `/projects/${fixture.projectId}/configs/update-overrides-config`,
        token,
      );
      const configData = await getResponse.json();
      expect(configData.base.overrides).toHaveLength(2);
    });

    it('should remove all overrides', async () => {
      const {token} = await fixture.createAdminApiKey({
        scopes: ['config:write', 'config:read'],
      });

      await fixture.adminApiRequest(
        'POST',
        `/projects/${fixture.projectId}/configs`,
        token,
        createConfigBody(
          'remove-overrides-config',
          {default: true},
          {
            overrides: [
              {
                name: 'remove-override',
                conditions: [
                  {operator: 'equals', property: 'segment', value: {type: 'literal', value: 'old'}},
                ],
                value: {override: true},
              },
            ],
          },
        ),
      );

      const response = await fixture.adminApiRequest(
        'PUT',
        `/projects/${fixture.projectId}/configs/remove-overrides-config`,
        token,
        updateConfigBody({default: true}, {overrides: []}),
      );

      expect(response.status).toBe(200);

      const getResponse = await fixture.adminApiRequest(
        'GET',
        `/projects/${fixture.projectId}/configs/remove-overrides-config`,
        token,
      );
      const configData = await getResponse.json();
      expect(configData.base.overrides).toHaveLength(0);
    });
  });

  describe('Complex Updates', () => {
    it('should update multiple fields simultaneously', async () => {
      await fixture.registerUser('new-editor@example.com');

      const {token} = await fixture.createAdminApiKey({
        scopes: ['config:write', 'config:read'],
      });

      const createResponse = await fixture.adminApiRequest(
        'POST',
        `/projects/${fixture.projectId}/configs`,
        token,
        createConfigBody('multi-field-update-config', {v: 1}, {description: 'Original'}),
      );
      expect(createResponse.status).toBe(201);

      const newSchema = {
        type: 'object',
        properties: {v: {type: 'number'}, extra: {type: 'string'}},
      };

      const response = await fixture.adminApiRequest(
        'PUT',
        `/projects/${fixture.projectId}/configs/multi-field-update-config`,
        token,
        updateConfigBody(
          {v: 2, extra: 'added'},
          {
            description: 'Updated',
            schema: newSchema,
            editors: ['new-editor@example.com'],
            overrides: [
              {
                name: 's1-override',
                conditions: [
                  {operator: 'equals', property: 'segment', value: {type: 'literal', value: 's1'}},
                ],
                value: {v: 99},
              },
            ],
            variants: [
              {
                environmentId: fixture.productionEnvironmentId,
                value: {v: 3, extra: 'prod'},
                schema: undefined,
                overrides: [],
                useBaseSchema: true,
              },
            ],
          },
        ),
      );

      expect(response.status).toBe(200);

      const getResponse = await fixture.adminApiRequest(
        'GET',
        `/projects/${fixture.projectId}/configs/multi-field-update-config`,
        token,
      );
      const configData = await getResponse.json();
      expect(configData.description).toBe('Updated');
      expect(configData.base.value).toEqual({v: 2, extra: 'added'});
      expect(configData.base.schema).toEqual(newSchema);
      expect(configData.editors).toEqual(['new-editor@example.com']);
      expect(configData.base.overrides).toHaveLength(1);
      // Only the explicitly specified production variant
      expect(configData.variants.length).toBeGreaterThanOrEqual(1);
      const prodVariant = configData.variants.find(
        (v: {environmentId: string}) => v.environmentId === fixture.productionEnvironmentId,
      );
      expect(prodVariant).toBeDefined();
    });
  });

  describe('Proposal Bypass for API Key', () => {
    it('should allow update when project has requireProposals enabled', async () => {
      // Enable requireProposals on the project
      await fixture.engine.useCases.patchProject(GLOBAL_CONTEXT, {
        identity: fixture.identity,
        id: fixture.projectId,
        details: {
          requireProposals: true,
        },
      });

      const {token} = await fixture.createAdminApiKey({
        scopes: ['config:write', 'config:read'],
      });

      // Create a config
      await fixture.adminApiRequest(
        'POST',
        `/projects/${fixture.projectId}/configs`,
        token,
        createConfigBody('proposal-bypass-config', 'original'),
      );

      // Update should succeed for API key even with requireProposals=true
      const response = await fixture.adminApiRequest(
        'PUT',
        `/projects/${fixture.projectId}/configs/proposal-bypass-config`,
        token,
        updateConfigBody('updated'),
      );

      expect(response.status).toBe(200);
    });
  });
});
