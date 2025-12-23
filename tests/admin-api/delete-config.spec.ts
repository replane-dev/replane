import {describe, expect, it} from 'vitest';
import {useAppFixture} from '../fixtures/app-fixture';

const CURRENT_USER_EMAIL = 'test@example.com';

describe('Admin API - Delete Config', () => {
  const fixture = useAppFixture({authEmail: CURRENT_USER_EMAIL});

  const createConfigBody = (name: string, value: unknown) => ({
    name,
    description: 'Test config',
    editors: [],
    maintainers: [],
    base: {
      value,
      schema: null,
      overrides: [],
    },
    environments: [],
  });

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
});
