import {describe, expect, it} from 'vitest';
import {useAppFixture} from '../fixtures/app-fixture';

const CURRENT_USER_EMAIL = 'test@example.com';

describe('Admin API - Get Workspace', () => {
  const fixture = useAppFixture({authEmail: CURRENT_USER_EMAIL});

  it('should return workspace for API key identity', async () => {
    const {token} = await fixture.createAdminApiKey({
      scopes: ['project:read', 'project:write'],
    });

    const response = await fixture.adminApiRequest(
      'GET',
      `/workspaces/${fixture.workspaceId}`,
      token,
    );

    expect(response.status).toBe(200);
    const data = await response.json();
    expect(data.id).toBe(fixture.workspaceId);
    expect(data.name).toBeDefined();
    expect(data.createdAt).toBeDefined();
    expect(data.updatedAt).toBeDefined();
  });

  it('should return 404 for API key trying to access different workspace', async () => {
    const {token} = await fixture.createAdminApiKey({
      scopes: ['project:read', 'project:write'],
    });

    // Try to access a non-existent workspace
    const response = await fixture.adminApiRequest(
      'GET',
      '/workspaces/00000000-0000-0000-0000-000000000000',
      token,
    );

    expect(response.status).toBe(403);
    const data = await response.json();
    expect(data.error).toBe('Forbidden');
  });

  it('should return 401 without API key', async () => {
    const request = new Request(`http://localhost/workspaces/${fixture.workspaceId}`, {
      method: 'GET',
    });

    const response = await fixture.adminApi.fetch(request);

    expect(response.status).toBe(401);
    const data = await response.json();
    expect(data.error).toBe('Missing API key');
  });
});
