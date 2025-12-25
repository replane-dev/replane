import {describe, expect, it} from 'vitest';
import {useAppFixture} from '../fixtures/app-fixture';

const CURRENT_USER_EMAIL = 'test@example.com';

describe('Admin API - Update Project', () => {
  const fixture = useAppFixture({authEmail: CURRENT_USER_EMAIL});

  it('should update project with project:write scope', async () => {
    const {token} = await fixture.createAdminApiKey({
      scopes: ['project:write', 'project:read'],
    });

    const response = await fixture.adminApiRequest(
      'PATCH',
      `/projects/${fixture.projectId}`,
      token,
      {
        name: 'Updated Project Name',
        description: 'Updated description',
      },
    );

    expect(response.status).toBe(200);
    const data = await response.json();
    expect(data.id).toBe(fixture.projectId);

    // Verify the update
    const getResponse = await fixture.adminApiRequest(
      'GET',
      `/projects/${fixture.projectId}`,
      token,
    );
    expect(getResponse.status).toBe(200);
    const projectData = await getResponse.json();
    expect(projectData.name).toBe('Updated Project Name');
    expect(projectData.description).toBe('Updated description');
  });

  it('should return 403 without project:write scope', async () => {
    const {token} = await fixture.createAdminApiKey({
      scopes: ['project:read'],
    });

    const response = await fixture.adminApiRequest(
      'PATCH',
      `/projects/${fixture.projectId}`,
      token,
      {name: 'Should Fail'},
    );

    expect(response.status).toBe(403);
  });

  it('should update partial fields', async () => {
    const {token} = await fixture.createAdminApiKey({
      scopes: ['project:write', 'project:read'],
    });

    // Get current state
    const getResponse = await fixture.adminApiRequest(
      'GET',
      `/projects/${fixture.projectId}`,
      token,
    );
    const currentProject = await getResponse.json();

    // Update only description
    const response = await fixture.adminApiRequest(
      'PATCH',
      `/projects/${fixture.projectId}`,
      token,
      {
        description: 'Only description updated',
      },
    );

    expect(response.status).toBe(200);

    // Verify name is unchanged
    const verifyResponse = await fixture.adminApiRequest(
      'GET',
      `/projects/${fixture.projectId}`,
      token,
    );
    const updatedProject = await verifyResponse.json();
    expect(updatedProject.name).toBe(currentProject.name);
    expect(updatedProject.description).toBe('Only description updated');
  });

  it('should return 403 for non-accessible project', async () => {
    // API key can't access a project it doesn't have in its projectIds
    // Since we're using a project-restricted key, any unknown project returns 403
    const {token} = await fixture.createAdminApiKey({
      scopes: ['project:write'],
      projectIds: [fixture.projectId], // Only has access to fixture project
    });

    const response = await fixture.adminApiRequest(
      'PATCH',
      '/projects/00000000-0000-0000-0000-000000000000',
      token,
      {name: 'Should Fail'},
    );

    // Returns 403 because API key doesn't have access to this project
    expect(response.status).toBe(403);
  });
});

