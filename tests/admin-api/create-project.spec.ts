import {describe, expect, it} from 'vitest';
import {useAppFixture} from '../fixtures/app-fixture';

const CURRENT_USER_EMAIL = 'test@example.com';

describe('Admin API - Create Project', () => {
  const fixture = useAppFixture({authEmail: CURRENT_USER_EMAIL});

  it('should create project with project:write scope', async () => {
    const {token} = await fixture.createAdminApiKey({
      scopes: ['project:write', 'project:read'],
    });

    const response = await fixture.adminApiRequest('POST', '/projects', token, {
      name: 'API Created Project',
      description: 'Created via Admin API',
      workspaceId: fixture.workspaceId,
    });

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

    const response = await fixture.adminApiRequest('POST', '/projects', token, {
      name: 'Should Fail',
      description: 'Test project',
      workspaceId: fixture.workspaceId,
    });

    expect(response.status).toBe(403);
  });

  it('should create project with custom settings', async () => {
    const {token} = await fixture.createAdminApiKey({
      scopes: ['project:write', 'project:read'],
    });

    const response = await fixture.adminApiRequest('POST', '/projects', token, {
      name: 'Custom Settings Project',
      description: 'With proposals enabled',
      workspaceId: fixture.workspaceId,
      requireProposals: true,
      allowSelfApprovals: false,
    });

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
    await fixture.adminApiRequest('POST', '/projects', token, {
      name: 'Duplicate Test',
      description: 'First project',
      workspaceId: fixture.workspaceId,
    });

    // Try to create duplicate
    const response = await fixture.adminApiRequest('POST', '/projects', token, {
      name: 'Duplicate Test',
      description: 'Second project',
      workspaceId: fixture.workspaceId,
    });

    expect(response.status).toBe(400);
    const data = await response.json();
    // Error message could be in different formats depending on the error type
    const errorString = typeof data.error === 'string' ? data.error : JSON.stringify(data);
    expect(errorString.toLowerCase()).toContain('already exists');
  });

  it('should return 400 when workspaceId is missing', async () => {
    const {token} = await fixture.createAdminApiKey({
      scopes: ['project:write'],
    });

    const response = await fixture.adminApiRequest('POST', '/projects', token, {
      name: 'Missing Workspace',
      description: 'Test project without workspaceId',
    });

    expect(response.status).toBe(400);
  });
});
