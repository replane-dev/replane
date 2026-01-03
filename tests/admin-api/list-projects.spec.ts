import {GLOBAL_CONTEXT} from '@/engine/core/context';
import {describe, expect, it} from 'vitest';
import {useAppFixture} from '../fixtures/app-fixture';

const CURRENT_USER_EMAIL = 'test@example.com';

describe('Admin API - List Projects', () => {
  const fixture = useAppFixture({authEmail: CURRENT_USER_EMAIL});

  it('should list projects with project:read scope', async () => {
    const {token} = await fixture.createAdminApiKey({
      scopes: ['project:read'],
    });

    const response = await fixture.adminApiRequest('GET', '/projects', token);

    expect(response.status).toBe(200);
    const data = await response.json();
    // Should have at least the test project
    expect(data.projects.length).toBeGreaterThanOrEqual(1);
    const testProject = data.projects.find((p: {id: string}) => p.id === fixture.projectId);
    expect(testProject).toBeDefined();
    expect(testProject.name).toBe('Test Project');
  });

  it('should return 403 without project:read scope', async () => {
    const {token} = await fixture.createAdminApiKey({
      scopes: ['config:read'], // Wrong scope
    });

    const response = await fixture.adminApiRequest('GET', '/projects', token);

    expect(response.status).toBe(403);
    const data = await response.json();
    expect(data.error).toBe('Forbidden');
  });

  it('should only list projects the API key has access to', async () => {
    // Create a second project
    const {projectId: secondProjectId} = await fixture.engine.useCases.createProject(
      GLOBAL_CONTEXT,
      {
        identity: fixture.identity,
        workspaceId: fixture.workspaceId,
        name: 'Second Project',
        description: 'Second project for tests',
      },
    );

    // Create API key restricted to only the second project
    const {token} = await fixture.createAdminApiKey({
      scopes: ['project:read'],
      projectIds: [secondProjectId],
    });

    const response = await fixture.adminApiRequest('GET', '/projects', token);

    expect(response.status).toBe(200);
    const data = await response.json();
    expect(data.projects).toHaveLength(1);
    expect(data.projects[0].id).toBe(secondProjectId);
    expect(data.projects[0].name).toBe('Second Project');
  });

  it('should return 401 with invalid API key', async () => {
    const response = await fixture.adminApiRequest('GET', '/projects', 'invalid-token');

    expect(response.status).toBe(401);
    const data = await response.json();
    expect(data.error).toBe('Invalid API key format');
  });

  it('should return 401 without API key', async () => {
    const request = new Request('http://localhost/projects', {
      method: 'GET',
    });

    const response = await fixture.adminApi.fetch(request);

    expect(response.status).toBe(401);
    const data = await response.json();
    expect(data.error).toBe('Missing API key');
  });

  it('should return 401 with expired API key', async () => {
    const pastDate = new Date('2019-01-01');
    const {token} = await fixture.createAdminApiKey({
      scopes: ['project:read'],
      expiresAt: pastDate,
    });

    const response = await fixture.adminApiRequest('GET', '/projects', token);

    expect(response.status).toBe(401);
    const data = await response.json();
    expect(data.error).toBe('API key has expired');
  });
});
