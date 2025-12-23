import {describe, expect, it} from 'vitest';
import {useAppFixture} from '../fixtures/app-fixture';

const CURRENT_USER_EMAIL = 'test@example.com';

describe('Admin API - Update Config', () => {
  const fixture = useAppFixture({authEmail: CURRENT_USER_EMAIL});

  it('should update config value with config:write scope', async () => {
    const {token} = await fixture.createAdminApiKey({
      scopes: ['config:write', 'config:read'],
    });

    // Create a config first via API
    const createResponse = await fixture.adminApiRequest(
      'POST',
      `/projects/${fixture.projectId}/configs`,
      token,
      {
        name: 'update-test-config',
        value: {enabled: false},
      },
    );
    expect(createResponse.status).toBe(201);
    const {id: configId} = await createResponse.json();

    const response = await fixture.adminApiRequest(
      'PUT',
      `/projects/${fixture.projectId}/configs/update-test-config`,
      token,
      {
        value: {enabled: true},
        version: 1,
      },
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
    expect(configData.value).toEqual({enabled: true});
  });

  it('should return 403 without config:write scope', async () => {
    const writeToken = (
      await fixture.createAdminApiKey({
        scopes: ['config:write'],
      })
    ).token;

    // Create a config first
    await fixture.adminApiRequest('POST', `/projects/${fixture.projectId}/configs`, writeToken, {
      name: 'readonly-config',
      value: 'original',
    });

    const {token: readToken} = await fixture.createAdminApiKey({
      scopes: ['config:read'],
    });

    const response = await fixture.adminApiRequest(
      'PUT',
      `/projects/${fixture.projectId}/configs/readonly-config`,
      readToken,
      {
        value: 'modified',
        version: 1,
      },
    );

    expect(response.status).toBe(403);
  });

  it('should return 400 for version mismatch', async () => {
    const {token} = await fixture.createAdminApiKey({
      scopes: ['config:write'],
    });

    // Create a config first
    await fixture.adminApiRequest('POST', `/projects/${fixture.projectId}/configs`, token, {
      name: 'version-test-config',
      value: 'v1',
    });

    // First update succeeds
    await fixture.adminApiRequest(
      'PUT',
      `/projects/${fixture.projectId}/configs/version-test-config`,
      token,
      {
        value: 'v2',
        version: 1,
      },
    );

    // Second update with old version should fail
    const response = await fixture.adminApiRequest(
      'PUT',
      `/projects/${fixture.projectId}/configs/version-test-config`,
      token,
      {
        value: 'v3',
        version: 1, // Wrong version
      },
    );

    expect(response.status).toBe(400);
    const data = await response.json();
    expect(data.error).toContain('edited');
  });

  it('should return 404 for non-existent config', async () => {
    const {token} = await fixture.createAdminApiKey({
      scopes: ['config:write'],
    });

    const response = await fixture.adminApiRequest(
      'PUT',
      `/projects/${fixture.projectId}/configs/non-existent-config`,
      token,
      {
        value: 'test',
        version: 1,
      },
    );

    expect(response.status).toBe(404);
  });

  it('should update config description', async () => {
    const {token} = await fixture.createAdminApiKey({
      scopes: ['config:write', 'config:read'],
    });

    // Create a config first
    await fixture.adminApiRequest('POST', `/projects/${fixture.projectId}/configs`, token, {
      name: 'desc-update-config',
      value: 'test',
      description: 'Original description',
    });

    const response = await fixture.adminApiRequest(
      'PUT',
      `/projects/${fixture.projectId}/configs/desc-update-config`,
      token,
      {
        value: 'test',
        description: 'Updated description',
        version: 1,
      },
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
