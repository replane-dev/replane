import {GLOBAL_CONTEXT} from '@/engine/core/context';
import {describe, expect, it} from 'vitest';
import {useAppFixture} from '../fixtures/app-fixture';

const CURRENT_USER_EMAIL = 'test@example.com';

describe('Admin API - Delete Config', () => {
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
    it('should delete config with config:write scope', async () => {
      const {token} = await fixture.createAdminApiKey({
        scopes: ['config:write', 'config:read'],
      });

      // Create a config first
      await fixture.adminApiRequest(
        'POST',
        `/projects/${fixture.projectId}/configs`,
        token,
        createConfigBody('config-to-delete', 'test'),
      );

      const response = await fixture.adminApiRequest(
        'DELETE',
        `/projects/${fixture.projectId}/configs/config-to-delete`,
        token,
      );

      expect(response.status).toBe(204);

      // Verify it's deleted
      const getResponse = await fixture.adminApiRequest(
        'GET',
        `/projects/${fixture.projectId}/configs/config-to-delete`,
        token,
      );
      expect(getResponse.status).toBe(404);
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
        createConfigBody('protected-config', 'test'),
      );

      const {token: readToken} = await fixture.createAdminApiKey({
        scopes: ['config:read'],
      });

      const response = await fixture.adminApiRequest(
        'DELETE',
        `/projects/${fixture.projectId}/configs/protected-config`,
        readToken,
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
        createConfigBody('project-restricted-delete-config', 'value'),
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
        'DELETE',
        `/projects/${fixture.projectId}/configs/project-restricted-delete-config`,
        restrictedToken,
      );

      expect(response.status).toBe(403);
    });
  });

  describe('Basic Deletion', () => {
    it('should return 404 for non-existent config', async () => {
      const {token} = await fixture.createAdminApiKey({
        scopes: ['config:write'],
      });

      const response = await fixture.adminApiRequest(
        'DELETE',
        `/projects/${fixture.projectId}/configs/non-existent`,
        token,
      );

      expect(response.status).toBe(404);
    });

    it('should delete config with all related data', async () => {
      await fixture.registerUser('editor@example.com');

      const {token} = await fixture.createAdminApiKey({
        scopes: ['config:write', 'config:read'],
      });

      // Create a config with variants, editors, overrides, and schema
      await fixture.adminApiRequest(
        'POST',
        `/projects/${fixture.projectId}/configs`,
        token,
        createConfigBody(
          'complex-delete-config',
          {base: true},
          {
            schema: {type: 'object', properties: {base: {type: 'boolean'}}},
            editors: ['editor@example.com'],
            overrides: [
              {
                name: 'test-override',
                conditions: [
                  {
                    operator: 'equals',
                    property: 'userType',
                    value: {type: 'literal', value: 'test'},
                  },
                ],
                value: {override: true},
              },
            ],
            variants: [
              {
                environmentId: fixture.productionEnvironmentId,
                value: {production: true},
                schema: null,
                overrides: [],
                useBaseSchema: false,
              },
            ],
          },
        ),
      );

      // Delete
      const deleteResponse = await fixture.adminApiRequest(
        'DELETE',
        `/projects/${fixture.projectId}/configs/complex-delete-config`,
        token,
      );
      expect(deleteResponse.status).toBe(204);

      // Verify it's completely gone
      const getResponse = await fixture.adminApiRequest(
        'GET',
        `/projects/${fixture.projectId}/configs/complex-delete-config`,
        token,
      );
      expect(getResponse.status).toBe(404);
    });

    it('should allow creating config with same name after deletion', async () => {
      const {token} = await fixture.createAdminApiKey({
        scopes: ['config:write', 'config:read'],
      });

      // Create
      await fixture.adminApiRequest(
        'POST',
        `/projects/${fixture.projectId}/configs`,
        token,
        createConfigBody('reusable-name-config', 'first-value'),
      );

      // Delete
      await fixture.adminApiRequest(
        'DELETE',
        `/projects/${fixture.projectId}/configs/reusable-name-config`,
        token,
      );

      // Re-create with same name
      const createResponse = await fixture.adminApiRequest(
        'POST',
        `/projects/${fixture.projectId}/configs`,
        token,
        createConfigBody('reusable-name-config', 'second-value'),
      );
      expect(createResponse.status).toBe(201);

      // Verify new value
      const getResponse = await fixture.adminApiRequest(
        'GET',
        `/projects/${fixture.projectId}/configs/reusable-name-config`,
        token,
      );
      const configData = await getResponse.json();
      expect(configData.base.value).toBe('second-value');
      expect(configData.version).toBe(1); // New config starts at version 1
    });
  });

  describe('Proposal Bypass for API Key', () => {
    it('should allow deletion when project has requireProposals enabled', async () => {
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
        createConfigBody('proposal-bypass-delete-config', 'value'),
      );

      // Delete should succeed for API key even with requireProposals=true
      const response = await fixture.adminApiRequest(
        'DELETE',
        `/projects/${fixture.projectId}/configs/proposal-bypass-delete-config`,
        token,
      );

      expect(response.status).toBe(204);
    });
  });

  describe('Multiple Configs', () => {
    it('should only delete the specified config', async () => {
      const {token} = await fixture.createAdminApiKey({
        scopes: ['config:write', 'config:read'],
      });

      // Create multiple configs
      await fixture.adminApiRequest(
        'POST',
        `/projects/${fixture.projectId}/configs`,
        token,
        createConfigBody('config-a', 'value-a'),
      );
      await fixture.adminApiRequest(
        'POST',
        `/projects/${fixture.projectId}/configs`,
        token,
        createConfigBody('config-b', 'value-b'),
      );
      await fixture.adminApiRequest(
        'POST',
        `/projects/${fixture.projectId}/configs`,
        token,
        createConfigBody('config-c', 'value-c'),
      );

      // Delete only config-b
      const deleteResponse = await fixture.adminApiRequest(
        'DELETE',
        `/projects/${fixture.projectId}/configs/config-b`,
        token,
      );
      expect(deleteResponse.status).toBe(204);

      // Verify config-b is deleted
      const getBResponse = await fixture.adminApiRequest(
        'GET',
        `/projects/${fixture.projectId}/configs/config-b`,
        token,
      );
      expect(getBResponse.status).toBe(404);

      // Verify config-a still exists
      const getAResponse = await fixture.adminApiRequest(
        'GET',
        `/projects/${fixture.projectId}/configs/config-a`,
        token,
      );
      expect(getAResponse.status).toBe(200);

      // Verify config-c still exists
      const getCResponse = await fixture.adminApiRequest(
        'GET',
        `/projects/${fixture.projectId}/configs/config-c`,
        token,
      );
      expect(getCResponse.status).toBe(200);

      // Verify list only has 2 configs
      const listResponse = await fixture.adminApiRequest(
        'GET',
        `/projects/${fixture.projectId}/configs`,
        token,
      );
      const listData = await listResponse.json();
      expect(listData.configs).toHaveLength(2);
      expect(listData.configs.map((c: {name: string}) => c.name).sort()).toEqual([
        'config-a',
        'config-c',
      ]);
    });
  });

  describe('Idempotency', () => {
    it('should return 404 on second delete of same config', async () => {
      const {token} = await fixture.createAdminApiKey({
        scopes: ['config:write'],
      });

      // Create
      await fixture.adminApiRequest(
        'POST',
        `/projects/${fixture.projectId}/configs`,
        token,
        createConfigBody('idempotent-delete-config', 'value'),
      );

      // First delete - should succeed
      const firstDelete = await fixture.adminApiRequest(
        'DELETE',
        `/projects/${fixture.projectId}/configs/idempotent-delete-config`,
        token,
      );
      expect(firstDelete.status).toBe(204);

      // Second delete - should return 404
      const secondDelete = await fixture.adminApiRequest(
        'DELETE',
        `/projects/${fixture.projectId}/configs/idempotent-delete-config`,
        token,
      );
      expect(secondDelete.status).toBe(404);
    });
  });

  describe('Cross-Project Isolation', () => {
    it('should not delete config from different project with same name', async () => {
      const {token} = await fixture.createAdminApiKey({
        scopes: ['config:write', 'config:read'],
        projectIds: null,
      });

      // Create config in first project
      await fixture.adminApiRequest(
        'POST',
        `/projects/${fixture.projectId}/configs`,
        token,
        createConfigBody('shared-name', 'project1-value'),
      );

      // Create second project and config with same name
      const {projectId: project2Id} = await fixture.engine.useCases.createProject(GLOBAL_CONTEXT, {
        identity: fixture.identity,
        workspaceId: fixture.workspaceId,
        name: 'Project 2',
        description: 'Second project',
      });

      await fixture.adminApiRequest(
        'POST',
        `/projects/${project2Id}/configs`,
        token,
        createConfigBody('shared-name', 'project2-value'),
      );

      // Delete from first project
      const deleteResponse = await fixture.adminApiRequest(
        'DELETE',
        `/projects/${fixture.projectId}/configs/shared-name`,
        token,
      );
      expect(deleteResponse.status).toBe(204);

      // Verify deleted from first project
      const get1Response = await fixture.adminApiRequest(
        'GET',
        `/projects/${fixture.projectId}/configs/shared-name`,
        token,
      );
      expect(get1Response.status).toBe(404);

      // Verify still exists in second project
      const get2Response = await fixture.adminApiRequest(
        'GET',
        `/projects/${project2Id}/configs/shared-name`,
        token,
      );
      expect(get2Response.status).toBe(200);
      const configData = await get2Response.json();
      expect(configData.base.value).toBe('project2-value');
    });
  });
});
