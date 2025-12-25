import {describe, expect, it} from 'vitest';
import {useAppFixture} from '../fixtures/app-fixture';

const CURRENT_USER_EMAIL = 'test@example.com';

describe('Admin API - Create Workspace', () => {
  const fixture = useAppFixture({authEmail: CURRENT_USER_EMAIL});

  it('should return error for non-superuser API key', async () => {
    const {token} = await fixture.createAdminApiKey({
      scopes: ['project:read', 'project:write'],
    });

    const response = await fixture.adminApiRequest('POST', '/workspaces', token, {
      name: 'New Workspace',
    });

    // API key identity cannot create workspaces (only superuser or user identity can)
    expect(response.status).toBe(403);
  });

  it('should return 401 without API key', async () => {
    const request = new Request('http://localhost/workspaces', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({name: 'New Workspace'}),
    });

    const response = await fixture.adminApi.fetch(request);

    expect(response.status).toBe(401);
    const data = await response.json();
    expect(data.error).toBe('Missing API key');
  });

  it('should return 400 for empty workspace name', async () => {
    const {token} = await fixture.createAdminApiKey({
      scopes: ['project:read', 'project:write'],
    });

    const response = await fixture.adminApiRequest('POST', '/workspaces', token, {
      name: '',
    });

    expect(response.status).toBe(400);
  });
});
