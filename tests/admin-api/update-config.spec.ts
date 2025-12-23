import {describe, expect, it} from 'vitest';
import {useAppFixture} from '../fixtures/app-fixture';

const CURRENT_USER_EMAIL = 'test@example.com';

describe('Admin API - Update Config', () => {
  const fixture = useAppFixture({authEmail: CURRENT_USER_EMAIL});

  const createConfigBody = (name: string, value: unknown, description = 'Test config') => ({
    name,
    description,
    editors: [],
    maintainers: [],
    base: {
      value,
      schema: null,
      overrides: [],
    },
    environments: [],
  });

  const updateConfigBody = (value: unknown, description = 'Test config') => ({
    description,
    editors: [],
    base: {
      value,
      schema: null,
      overrides: [],
    },
    environments: [],
  });

  it('should update config value with config:write scope', async () => {
    const {token} = await fixture.createAdminApiKey({
      scopes: ['config:write', 'config:read'],
    });

    // Create a config first via API
    const createResponse = await fixture.adminApiRequest(
      'POST',
      `/projects/${fixture.projectId}/configs`,
      token,
      createConfigBody('update-test-config', {enabled: false}),
    );
    expect(createResponse.status).toBe(201);
    const {id: configId} = await createResponse.json();

    const response = await fixture.adminApiRequest(
      'PUT',
      `/projects/${fixture.projectId}/configs/update-test-config`,
      token,
      updateConfigBody({enabled: true}),
    );

    expect(response.status).toBe(200);
    const data = await response.json();
    expect(data.id).toBe(configId);
    expect(data.version).toBe(2);

    // Verify the update
    const getResponse = await fixture.adminApiRequest(
      'GET',
      `/projects/${fixture.projectId}/configs/update-test-config`,
      token,
    );
    const configData = await getResponse.json();
    expect(configData.base.value).toEqual({enabled: true});
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

  it('should update config description', async () => {
    const {token} = await fixture.createAdminApiKey({
      scopes: ['config:write', 'config:read'],
    });

    // Create a config first
    await fixture.adminApiRequest(
      'POST',
      `/projects/${fixture.projectId}/configs`,
      token,
      createConfigBody('desc-update-config', 'test', 'Original description'),
    );

    const response = await fixture.adminApiRequest(
      'PUT',
      `/projects/${fixture.projectId}/configs/desc-update-config`,
      token,
      updateConfigBody('test', 'Updated description'),
    );

    expect(response.status).toBe(200);

    // Verify description was updated
    const getResponse = await fixture.adminApiRequest(
      'GET',
      `/projects/${fixture.projectId}/configs/desc-update-config`,
      token,
    );
    const configData = await getResponse.json();
    expect(configData.description).toBe('Updated description');
  });
});
