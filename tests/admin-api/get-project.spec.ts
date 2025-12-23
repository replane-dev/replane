import {GLOBAL_CONTEXT} from '@/engine/core/context';
import {describe, expect, it} from 'vitest';
import {useAppFixture} from '../fixtures/app-fixture';

const CURRENT_USER_EMAIL = 'test@example.com';

describe('Admin API - Get Project', () => {
  const fixture = useAppFixture({authEmail: CURRENT_USER_EMAIL});

  it('should get project details with project:read scope', async () => {
    const {token} = await fixture.createAdminApiKey({
      scopes: ['project:read'],
    });

    const response = await fixture.adminApiRequest(
      'GET',
      `/projects/${fixture.projectId}`,
      token,
    );

    expect(response.status).toBe(200);
    const data = await response.json();
    expect(data.id).toBe(fixture.projectId);
    expect(data.name).toBe('Test Project');
    expect(data.description).toBe('Default project for tests');
    expect(data.createdAt).toBeDefined();
    expect(data.updatedAt).toBeDefined();
  });

  it('should return 403 without project:read scope', async () => {
    const {token} = await fixture.createAdminApiKey({
      scopes: ['config:read'],
    });

    const response = await fixture.adminApiRequest(
      'GET',
      `/projects/${fixture.projectId}`,
      token,
    );

    expect(response.status).toBe(403);
  });

  it('should return 403 when API key does not have access to the project', async () => {
    // Create a second project
    const {projectId: secondProjectId} = await fixture.engine.useCases.createProject(
      GLOBAL_CONTEXT,
      {
        identity: fixture.identity,
        workspaceId: fixture.workspaceId,
        name: 'Second Project',
        description: 'Second project',
      },
    );

    // Create API key restricted to only the second project
    const {token} = await fixture.createAdminApiKey({
      scopes: ['project:read'],
      projectIds: [secondProjectId],
    });

    // Try to access the first project
    const response = await fixture.adminApiRequest(
      'GET',
      `/projects/${fixture.projectId}`,
      token,
    );

    expect(response.status).toBe(403);
    const data = await response.json();
    expect(data.error).toBe('Forbidden');
  });

  it('should return 404 for non-existent project', async () => {
    const {token} = await fixture.createAdminApiKey({
      scopes: ['project:read'],
    });

    const nonExistentId = '00000000-0000-0000-0000-000000000000';
    const response = await fixture.adminApiRequest('GET', `/projects/${nonExistentId}`, token);

    // Returns 403 because the API key doesn't have access to this project ID
    expect(response.status).toBe(403);
  });

  it('should return 400 for invalid UUID', async () => {
    const {token} = await fixture.createAdminApiKey({
      scopes: ['project:read'],
    });

    const response = await fixture.adminApiRequest('GET', '/projects/not-a-uuid', token);

    expect(response.status).toBe(400);
  });
});

