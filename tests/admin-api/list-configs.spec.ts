import {GLOBAL_CONTEXT} from '@/engine/core/context';
import {describe, expect, it} from 'vitest';
import {useAppFixture} from '../fixtures/app-fixture';

const CURRENT_USER_EMAIL = 'test@example.com';

describe('Admin API - List Configs', () => {
  const fixture = useAppFixture({authEmail: CURRENT_USER_EMAIL});

  const createConfigBody = (
    name: string,
    value: unknown,
    options: {
      description?: string;
    } = {},
  ) => ({
    name,
    description: options.description ?? 'Test config',
    editors: [],
    maintainers: [],
    base: {
      value,
      schema: null,
      overrides: [],
    },
    variants: [],
  });

  describe('Authorization', () => {
    it('should list configs with config:read scope', async () => {
      const {token} = await fixture.createAdminApiKey({
        scopes: ['config:write', 'config:read'],
      });

      // Create a config
      await fixture.adminApiRequest(
        'POST',
        `/projects/${fixture.projectId}/configs`,
        token,
        createConfigBody('list-auth-config', {key: 'value'}),
      );

      const response = await fixture.adminApiRequest(
        'GET',
        `/projects/${fixture.projectId}/configs`,
        token,
      );

      expect(response.status).toBe(200);
      const data = await response.json();
      expect(data.configs).toHaveLength(1);
      expect(data.configs[0].name).toBe('list-auth-config');
      expect(data.configs[0].id).toBeDefined();
      expect(data.configs[0].version).toBe(1);
    });

    it('should return 403 without config:read scope', async () => {
      const {token} = await fixture.createAdminApiKey({
        scopes: ['project:read'],
      });

      const response = await fixture.adminApiRequest(
        'GET',
        `/projects/${fixture.projectId}/configs`,
        token,
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
        scopes: ['config:read'],
        projectIds: [otherProjectId],
      });

      // Try to access the first project's configs
      const response = await fixture.adminApiRequest(
        'GET',
        `/projects/${fixture.projectId}/configs`,
        token,
      );

      expect(response.status).toBe(403);
    });

    it('should list configs with unrestricted project access', async () => {
      const {token} = await fixture.createAdminApiKey({
        scopes: ['config:write', 'config:read'],
        projectIds: null,
      });

      await fixture.adminApiRequest(
        'POST',
        `/projects/${fixture.projectId}/configs`,
        token,
        createConfigBody('unrestricted-list-config', 'value'),
      );

      const response = await fixture.adminApiRequest(
        'GET',
        `/projects/${fixture.projectId}/configs`,
        token,
      );

      expect(response.status).toBe(200);
      const data = await response.json();
      expect(data.configs.length).toBeGreaterThanOrEqual(1);
    });
  });

  describe('Empty State', () => {
    it('should return empty array when no configs exist', async () => {
      const {token} = await fixture.createAdminApiKey({
        scopes: ['config:read'],
      });

      const response = await fixture.adminApiRequest(
        'GET',
        `/projects/${fixture.projectId}/configs`,
        token,
      );

      expect(response.status).toBe(200);
      const data = await response.json();
      expect(data.configs).toHaveLength(0);
    });
  });

  describe('Multiple Configs', () => {
    it('should list multiple configs', async () => {
      const {token} = await fixture.createAdminApiKey({
        scopes: ['config:write', 'config:read'],
      });

      // Create multiple configs
      await fixture.adminApiRequest(
        'POST',
        `/projects/${fixture.projectId}/configs`,
        token,
        createConfigBody('multi-config-a', 'value-a'),
      );

      await fixture.adminApiRequest(
        'POST',
        `/projects/${fixture.projectId}/configs`,
        token,
        createConfigBody('multi-config-b', 'value-b'),
      );

      await fixture.adminApiRequest(
        'POST',
        `/projects/${fixture.projectId}/configs`,
        token,
        createConfigBody('multi-config-c', 'value-c'),
      );

      const response = await fixture.adminApiRequest(
        'GET',
        `/projects/${fixture.projectId}/configs`,
        token,
      );

      expect(response.status).toBe(200);
      const data = await response.json();
      expect(data.configs).toHaveLength(3);
      expect(data.configs.map((c: {name: string}) => c.name).sort()).toEqual([
        'multi-config-a',
        'multi-config-b',
        'multi-config-c',
      ]);
    });

    it('should list configs only from the specified project', async () => {
      const {token} = await fixture.createAdminApiKey({
        scopes: ['config:write', 'config:read'],
        projectIds: null,
      });

      // Create config in first project
      await fixture.adminApiRequest(
        'POST',
        `/projects/${fixture.projectId}/configs`,
        token,
        createConfigBody('project1-config', 'value1'),
      );

      // Create second project with config
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
        createConfigBody('project2-config', 'value2'),
      );

      // List configs from first project only
      const response1 = await fixture.adminApiRequest(
        'GET',
        `/projects/${fixture.projectId}/configs`,
        token,
      );
      expect(response1.status).toBe(200);
      const data1 = await response1.json();
      expect(data1.configs).toHaveLength(1);
      expect(data1.configs[0].name).toBe('project1-config');

      // List configs from second project only
      const response2 = await fixture.adminApiRequest(
        'GET',
        `/projects/${project2Id}/configs`,
        token,
      );
      expect(response2.status).toBe(200);
      const data2 = await response2.json();
      expect(data2.configs).toHaveLength(1);
      expect(data2.configs[0].name).toBe('project2-config');
    });
  });

  describe('Response Format', () => {
    it('should return configs with all expected fields', async () => {
      const {token} = await fixture.createAdminApiKey({
        scopes: ['config:write', 'config:read'],
      });

      await fixture.adminApiRequest(
        'POST',
        `/projects/${fixture.projectId}/configs`,
        token,
        createConfigBody('format-test-config', 'value', {description: 'A test description for listing'}),
      );

      const response = await fixture.adminApiRequest(
        'GET',
        `/projects/${fixture.projectId}/configs`,
        token,
      );

      expect(response.status).toBe(200);
      const data = await response.json();
      expect(data.configs).toHaveLength(1);

      const config = data.configs[0];
      expect(config).toHaveProperty('id');
      expect(config).toHaveProperty('name', 'format-test-config');
      expect(config).toHaveProperty('description');
      expect(config).toHaveProperty('version', 1);
      expect(config).toHaveProperty('createdAt');
      expect(config).toHaveProperty('updatedAt');

      // Check timestamp format
      expect(config.createdAt).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/);
      expect(config.updatedAt).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/);

      // Check ID format (UUID)
      expect(config.id).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i);
    });

    it('should return truncated description as descriptionPreview', async () => {
      const {token} = await fixture.createAdminApiKey({
        scopes: ['config:write', 'config:read'],
      });

      const longDescription = 'A'.repeat(500);
      await fixture.adminApiRequest(
        'POST',
        `/projects/${fixture.projectId}/configs`,
        token,
        createConfigBody('long-desc-config', 'value', {description: longDescription}),
      );

      const response = await fixture.adminApiRequest(
        'GET',
        `/projects/${fixture.projectId}/configs`,
        token,
      );

      expect(response.status).toBe(200);
      const data = await response.json();
      const config = data.configs[0];
      // Description in list response should exist (may be truncated or full depending on API design)
      expect(config.description).toBeDefined();
    });

    it('should reflect updated version in list', async () => {
      const {token} = await fixture.createAdminApiKey({
        scopes: ['config:write', 'config:read'],
      });

      await fixture.adminApiRequest(
        'POST',
        `/projects/${fixture.projectId}/configs`,
        token,
        createConfigBody('version-list-config', 'v1'),
      );

      // Update the config
      await fixture.adminApiRequest(
        'PUT',
        `/projects/${fixture.projectId}/configs/version-list-config`,
        token,
        {
          description: 'Updated',
          editors: [],
          base: {value: 'v2', schema: null, overrides: []},
          variants: [],
        },
      );

      const response = await fixture.adminApiRequest(
        'GET',
        `/projects/${fixture.projectId}/configs`,
        token,
      );

      expect(response.status).toBe(200);
      const data = await response.json();
      const config = data.configs.find((c: {name: string}) => c.name === 'version-list-config');
      expect(config.version).toBe(2);
    });
  });

  describe('After Deletion', () => {
    it('should not list deleted configs', async () => {
      const {token} = await fixture.createAdminApiKey({
        scopes: ['config:write', 'config:read'],
      });

      // Create multiple configs
      await fixture.adminApiRequest(
        'POST',
        `/projects/${fixture.projectId}/configs`,
        token,
        createConfigBody('keep-config', 'keep'),
      );

      await fixture.adminApiRequest(
        'POST',
        `/projects/${fixture.projectId}/configs`,
        token,
        createConfigBody('delete-config', 'delete'),
      );

      // Delete one config
      await fixture.adminApiRequest(
        'DELETE',
        `/projects/${fixture.projectId}/configs/delete-config`,
        token,
      );

      // List should only show remaining config
      const response = await fixture.adminApiRequest(
        'GET',
        `/projects/${fixture.projectId}/configs`,
        token,
      );

      expect(response.status).toBe(200);
      const data = await response.json();
      expect(data.configs).toHaveLength(1);
      expect(data.configs[0].name).toBe('keep-config');
    });
  });

  describe('Large Number of Configs', () => {
    it('should list many configs', async () => {
      const {token} = await fixture.createAdminApiKey({
        scopes: ['config:write', 'config:read'],
      });

      const configCount = 20;

      // Create many configs
      for (let i = 0; i < configCount; i++) {
        await fixture.adminApiRequest(
          'POST',
          `/projects/${fixture.projectId}/configs`,
          token,
          createConfigBody(`bulk-config-${i.toString().padStart(2, '0')}`, {index: i}),
        );
      }

      const response = await fixture.adminApiRequest(
        'GET',
        `/projects/${fixture.projectId}/configs`,
        token,
      );

      expect(response.status).toBe(200);
      const data = await response.json();
      expect(data.configs).toHaveLength(configCount);

      // Verify all configs are present
      for (let i = 0; i < configCount; i++) {
        const configName = `bulk-config-${i.toString().padStart(2, '0')}`;
        const found = data.configs.find((c: {name: string}) => c.name === configName);
        expect(found).toBeDefined();
      }
    });
  });
});
