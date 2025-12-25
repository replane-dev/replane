import {describe, expect, it} from 'vitest';
import {useAppFixture} from '../fixtures/app-fixture';

const CURRENT_USER_EMAIL = 'test@example.com';

describe('Admin API - List Workspaces', () => {
  const fixture = useAppFixture({authEmail: CURRENT_USER_EMAIL});

  it('should return workspace for API key identity', async () => {
    const {token} = await fixture.createAdminApiKey({
      scopes: ['project:read', 'project:write'],
    });

    const response = await fixture.adminApiRequest('GET', '/workspaces', token);

    expect(response.status).toBe(200);
    const data = await response.json();
    expect(data.workspaces).toHaveLength(1);
    expect(data.workspaces[0].id).toBe(fixture.workspaceId);
  });

  it('should return 401 without API key', async () => {
    const request = new Request('http://localhost/workspaces', {
      method: 'GET',
    });

    const response = await fixture.adminApi.fetch(request);

    expect(response.status).toBe(401);
    const data = await response.json();
    expect(data.error).toBe('Missing API key');
  });
});
