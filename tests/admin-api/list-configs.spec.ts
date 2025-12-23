import {GLOBAL_CONTEXT} from '@/engine/core/context';
import {describe, expect, it} from 'vitest';
import {useAppFixture} from '../fixtures/app-fixture';

const CURRENT_USER_EMAIL = 'test@example.com';

describe('Admin API - List Configs', () => {
  const fixture = useAppFixture({authEmail: CURRENT_USER_EMAIL});

  it('should list configs with config:read scope', async () => {
    // Create a config first
    await fixture.createConfig({
      name: 'test-config',
      value: {key: 'value'},
      schema: null,
      overrides: [],
      description: 'Test config description',
      identity: fixture.identity,
      editorEmails: [],
      maintainerEmails: [],
      projectId: fixture.projectId,
    });

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
    expect(data.configs).toHaveLength(1);
    expect(data.configs[0].name).toBe('test-config');
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
    // Create a second project that the API key will have access to
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

  it('should list multiple configs', async () => {
    // Create multiple configs
    await fixture.createConfig({
      name: 'config-a',
      value: 'value-a',
      schema: null,
      overrides: [],
      description: 'Config A',
      identity: fixture.identity,
      editorEmails: [],
      maintainerEmails: [],
      projectId: fixture.projectId,
    });

    await fixture.createConfig({
      name: 'config-b',
      value: 'value-b',
      schema: null,
      overrides: [],
      description: 'Config B',
      identity: fixture.identity,
      editorEmails: [],
      maintainerEmails: [],
      projectId: fixture.projectId,
    });

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
    expect(data.configs).toHaveLength(2);
    expect(data.configs.map((c: {name: string}) => c.name).sort()).toEqual([
      'config-a',
      'config-b',
    ]);
  });
});

