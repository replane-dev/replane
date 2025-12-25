import {describe, expect, it} from 'vitest';
import {useAppFixture} from '../fixtures/app-fixture';

const CURRENT_USER_EMAIL = 'test@example.com';

describe('Admin API - Create Project', () => {
  const fixture = useAppFixture({authEmail: CURRENT_USER_EMAIL});

  it('should create project with project:write scope', async () => {
    const {token} = await fixture.createAdminApiKey({
      scopes: ['project:write', 'project:read'],
    });

    const response = await fixture.adminApiRequest(
      'POST',
      `/workspaces/${fixture.workspaceId}/projects`,
      token,
      {
        name: 'API Created Project',
        description: 'Created via Admin API',
      },
    );

    expect(response.status).toBe(201);
    const data = await response.json();
    expect(data.id).toBeDefined();

    // Verify by fetching the created project
    const getResponse = await fixture.adminApiRequest('GET', `/projects/${data.id}`, token);
    expect(getResponse.status).toBe(200);
    const projectData = await getResponse.json();
    expect(projectData.name).toBe('API Created Project');
  });

  it('should return 403 without project:write scope', async () => {
    const {token} = await fixture.createAdminApiKey({
      scopes: ['project:read'],
    });

    const response = await fixture.adminApiRequest(
      'POST',
      `/workspaces/${fixture.workspaceId}/projects`,
      token,
      {
        name: 'Should Fail',
        description: 'Test project',
      },
    );

    expect(response.status).toBe(403);
  });

  it('should create project with custom settings', async () => {
    const {token} = await fixture.createAdminApiKey({
      scopes: ['project:write', 'project:read'],
    });

    const response = await fixture.adminApiRequest(
      'POST',
      `/workspaces/${fixture.workspaceId}/projects`,
      token,
      {
        name: 'Custom Settings Project',
        description: 'With proposals enabled',
        requireProposals: true,
        allowSelfApprovals: false,
      },
    );

    expect(response.status).toBe(201);
    const data = await response.json();
    expect(data.id).toBeDefined();

    // Verify by fetching the created project
    const getResponse = await fixture.adminApiRequest('GET', `/projects/${data.id}`, token);
    expect(getResponse.status).toBe(200);
    const projectData = await getResponse.json();
    expect(projectData.name).toBe('Custom Settings Project');
  });

  it('should return 400 for duplicate project name', async () => {
    const {token} = await fixture.createAdminApiKey({
      scopes: ['project:write'],
    });

    // Create first project
    await fixture.adminApiRequest('POST', `/workspaces/${fixture.workspaceId}/projects`, token, {
      name: 'Duplicate Test',
      description: 'First project',
    });

    // Try to create duplicate
    const response = await fixture.adminApiRequest(
      'POST',
      `/workspaces/${fixture.workspaceId}/projects`,
      token,
      {
        name: 'Duplicate Test',
        description: 'Second project',
      },
    );

    expect(response.status).toBe(400);
    const data = await response.json();
    // Error message could be in different formats depending on the error type
    const errorString = typeof data.error === 'string' ? data.error : JSON.stringify(data);
    expect(errorString.toLowerCase()).toContain('already exists');
  });
});
