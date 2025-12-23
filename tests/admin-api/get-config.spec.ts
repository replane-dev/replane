import {GLOBAL_CONTEXT} from '@/engine/core/context';
import {describe, expect, it} from 'vitest';
import {useAppFixture} from '../fixtures/app-fixture';

const CURRENT_USER_EMAIL = 'test@example.com';

describe('Admin API - Get Config', () => {
  const fixture = useAppFixture({authEmail: CURRENT_USER_EMAIL});

  it('should get config details with config:read scope', async () => {
    // Create a config first
    await fixture.createConfig({
      name: 'test-config',
      value: {key: 'value', nested: {data: 123}},
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
      `/projects/${fixture.projectId}/configs/test-config`,
      token,
    );

    expect(response.status).toBe(200);
    const data = await response.json();
    expect(data.name).toBe('test-config');
    expect(data.description).toBe('Test config description');
    expect(data.value).toEqual({key: 'value', nested: {data: 123}});
    expect(data.version).toBe(1);
    expect(data.id).toBeDefined();
    expect(data.createdAt).toBeDefined();
    expect(data.updatedAt).toBeDefined();
  });

  it('should return 403 without config:read scope', async () => {
    await fixture.createConfig({
      name: 'test-config',
      value: 'value',
      schema: null,
      overrides: [],
      description: 'Test config',
      identity: fixture.identity,
      editorEmails: [],
      maintainerEmails: [],
      projectId: fixture.projectId,
    });

    const {token} = await fixture.createAdminApiKey({
      scopes: ['project:read'],
    });

    const response = await fixture.adminApiRequest(
      'GET',
      `/projects/${fixture.projectId}/configs/test-config`,
      token,
    );

    expect(response.status).toBe(403);
  });

  it('should return 403 when API key does not have project access', async () => {
    await fixture.createConfig({
      name: 'test-config',
      value: 'value',
      schema: null,
      overrides: [],
      description: 'Test config',
      identity: fixture.identity,
      editorEmails: [],
      maintainerEmails: [],
      projectId: fixture.projectId,
    });

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

    // Try to access the first project's config
    const response = await fixture.adminApiRequest(
      'GET',
      `/projects/${fixture.projectId}/configs/test-config`,
      token,
    );

    expect(response.status).toBe(403);
  });

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

  it('should get config with string value', async () => {
    await fixture.createConfig({
      name: 'string-config',
      value: 'simple string value',
      schema: null,
      overrides: [],
      description: 'String config',
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
      `/projects/${fixture.projectId}/configs/string-config`,
      token,
    );

    expect(response.status).toBe(200);
    const data = await response.json();
    expect(data.value).toBe('simple string value');
  });

  it('should get config with array value', async () => {
    await fixture.createConfig({
      name: 'array-config',
      value: [1, 2, 3, 'four'],
      schema: null,
      overrides: [],
      description: 'Array config',
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
      `/projects/${fixture.projectId}/configs/array-config`,
      token,
    );

    expect(response.status).toBe(200);
    const data = await response.json();
    expect(data.value).toEqual([1, 2, 3, 'four']);
  });
});
