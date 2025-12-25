import {GLOBAL_CONTEXT} from '@/engine/core/context';
import {describe, expect, it} from 'vitest';
import {useAppFixture} from '../fixtures/app-fixture';

const CURRENT_USER_EMAIL = 'test@example.com';

describe('Admin API - Delete Project', () => {
  const fixture = useAppFixture({authEmail: CURRENT_USER_EMAIL});

  it('should delete project with project:write scope', async () => {
    // Create a project to delete
    const {projectId} = await fixture.engine.useCases.createProject(GLOBAL_CONTEXT, {
      identity: fixture.identity,
      workspaceId: fixture.workspaceId,
      name: 'Project To Delete',
      description: 'Will be deleted',
    });

    const {token} = await fixture.createAdminApiKey({
      scopes: ['project:write', 'project:read'],
    });

    const response = await fixture.adminApiRequest('DELETE', `/projects/${projectId}`, token);

    expect(response.status).toBe(204);

    // Verify it's deleted by listing projects - the deleted one should not be there
    const listResponse = await fixture.adminApiRequest('GET', '/projects', token);
    expect(listResponse.status).toBe(200);
    const listData = await listResponse.json();
    expect(listData.projects.find((p: {id: string}) => p.id === projectId)).toBeUndefined();
  });

  it('should return 403 without project:write scope', async () => {
    const {token} = await fixture.createAdminApiKey({
      scopes: ['project:read'],
    });

    const response = await fixture.adminApiRequest(
      'DELETE',
      `/projects/${fixture.projectId}`,
      token,
    );

    expect(response.status).toBe(403);
  });

  it('should return 403 when API key does not have project access', async () => {
    // Create a project to delete
    const {projectId} = await fixture.engine.useCases.createProject(GLOBAL_CONTEXT, {
      identity: fixture.identity,
      workspaceId: fixture.workspaceId,
      name: 'Project Without Access',
      description: 'Test',
    });

    // Create API key without access to this project
    const {token} = await fixture.createAdminApiKey({
      scopes: ['project:write'],
      projectIds: [fixture.projectId], // Only has access to main project
    });

    const response = await fixture.adminApiRequest('DELETE', `/projects/${projectId}`, token);

    expect(response.status).toBe(403);
  });
});
