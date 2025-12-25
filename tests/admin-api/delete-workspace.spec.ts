import {describe, expect, it} from 'vitest';
import {useAppFixture} from '../fixtures/app-fixture';

const CURRENT_USER_EMAIL = 'test@example.com';

describe('Admin API - Delete Workspace', () => {
  const fixture = useAppFixture({authEmail: CURRENT_USER_EMAIL});

  it('should return 403 for non-superuser API key', async () => {
    const {token} = await fixture.createAdminApiKey({
      scopes: ['project:read', 'project:write'],
    });

    const response = await fixture.adminApiRequest(
      'DELETE',
      `/workspaces/${fixture.workspaceId}`,
      token,
    );

    expect(response.status).toBe(403);
    const data = await response.json();
    expect(data.error).toBe('Forbidden');
  });

  it('should return 401 without API key', async () => {
    const request = new Request(`http://localhost/workspaces/${fixture.workspaceId}`, {
      method: 'DELETE',
    });

    const response = await fixture.adminApi.fetch(request);

    expect(response.status).toBe(401);
    const data = await response.json();
    expect(data.error).toBe('Missing API key');
  });

  it('should return 403 for non-superuser trying to delete any workspace', async () => {
    const {token} = await fixture.createAdminApiKey({
      scopes: ['project:read', 'project:write'],
    });

    // Try to delete a non-existent workspace - should still get 403 before 404
    const response = await fixture.adminApiRequest(
      'DELETE',
      '/workspaces/00000000-0000-0000-0000-000000000000',
      token,
    );

    expect(response.status).toBe(403);
    const data = await response.json();
    expect(data.error).toBe('Forbidden');
  });
});
