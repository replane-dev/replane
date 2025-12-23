import {describe, expect, it} from 'vitest';
import {useAppFixture} from '../fixtures/app-fixture';

const CURRENT_USER_EMAIL = 'test@example.com';

describe('Admin API - Delete Config', () => {
  const fixture = useAppFixture({authEmail: CURRENT_USER_EMAIL});

  it('should delete config with config:write scope', async () => {
    const {token} = await fixture.createAdminApiKey({
      scopes: ['config:write', 'config:read'],
    });

    // Create a config first
    await fixture.adminApiRequest('POST', `/projects/${fixture.projectId}/configs`, token, {
      name: 'config-to-delete',
      value: 'test',
    });

    const response = await fixture.adminApiRequest(
      'DELETE',
      `/projects/${fixture.projectId}/configs/config-to-delete?version=1`,
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
    await fixture.adminApiRequest('POST', `/projects/${fixture.projectId}/configs`, writeToken, {
      name: 'protected-config',
      value: 'test',
    });

    const {token: readToken} = await fixture.createAdminApiKey({
      scopes: ['config:read'],
    });

    const response = await fixture.adminApiRequest(
      'DELETE',
      `/projects/${fixture.projectId}/configs/protected-config?version=1`,
      readToken,
    );

    expect(response.status).toBe(403);
  });

  it('should return 400 for version mismatch', async () => {
    const {token} = await fixture.createAdminApiKey({
      scopes: ['config:write'],
    });

    // Create a config first
    await fixture.adminApiRequest('POST', `/projects/${fixture.projectId}/configs`, token, {
      name: 'version-check-config',
      value: 'test',
    });

    // First update the config to increment version
    await fixture.adminApiRequest(
      'PUT',
      `/projects/${fixture.projectId}/configs/version-check-config`,
      token,
      {
        value: 'updated',
        version: 1,
      },
    );

    // Try to delete with old version
    const response = await fixture.adminApiRequest(
      'DELETE',
      `/projects/${fixture.projectId}/configs/version-check-config?version=1`,
      token,
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
      'DELETE',
      `/projects/${fixture.projectId}/configs/non-existent?version=1`,
      token,
    );

    expect(response.status).toBe(404);
  });
});
