import {GLOBAL_CONTEXT} from '@/engine/core/context';
import {describe, expect, it} from 'vitest';
import {useAppFixture} from '../fixtures/app-fixture';

const CURRENT_USER_EMAIL = 'test@example.com';

describe('Admin API - List Environments', () => {
  const fixture = useAppFixture({authEmail: CURRENT_USER_EMAIL});

  it('should list environments with environment:read scope', async () => {
    const {token} = await fixture.createAdminApiKey({
      scopes: ['environment:read'],
    });

    const response = await fixture.adminApiRequest(
      'GET',
      `/projects/${fixture.projectId}/environments`,
      token,
    );

    expect(response.status).toBe(200);
    const data = await response.json();
    expect(data.environments).toHaveLength(2);

    const envNames = data.environments.map((e: {name: string}) => e.name);
    expect(envNames).toContain('Production');
    expect(envNames).toContain('Development');
  });

  it('should return environments with correct properties', async () => {
    const {token} = await fixture.createAdminApiKey({
      scopes: ['environment:read'],
    });

    const response = await fixture.adminApiRequest(
      'GET',
      `/projects/${fixture.projectId}/environments`,
      token,
    );

    expect(response.status).toBe(200);
    const data = await response.json();

    for (const env of data.environments) {
      expect(env.id).toBeDefined();
      expect(env.name).toBeDefined();
      expect(typeof env.order).toBe('number');
      expect(typeof env.requireProposals).toBe('boolean');
    }
  });

  it('should return 403 without environment:read scope', async () => {
    const {token} = await fixture.createAdminApiKey({
      scopes: ['project:read'],
    });

    const response = await fixture.adminApiRequest(
      'GET',
      `/projects/${fixture.projectId}/environments`,
      token,
    );

    expect(response.status).toBe(403);
  });

  it('should return 403 when API key does not have project access', async () => {
    // Create a second project that the API key will have access to
    const {projectId: otherProjectId} = await fixture.engine.useCases.createProject(
      GLOBAL_CONTEXT,
      {
        identity: fixture.identity,
        workspaceId: fixture.workspaceId,
        name: 'Other Project',
        description: 'Other project',
      },
    );

    // Create API key with access only to the other project
    const {token} = await fixture.createAdminApiKey({
      scopes: ['environment:read'],
      projectIds: [otherProjectId],
    });

    // Try to access the first project's environments
    const response = await fixture.adminApiRequest(
      'GET',
      `/projects/${fixture.projectId}/environments`,
      token,
    );

    expect(response.status).toBe(403);
  });

  it('should list environments in order', async () => {
    const {token} = await fixture.createAdminApiKey({
      scopes: ['environment:read'],
    });

    const response = await fixture.adminApiRequest(
      'GET',
      `/projects/${fixture.projectId}/environments`,
      token,
    );

    expect(response.status).toBe(200);
    const data = await response.json();

    // Environments should be ordered
    const orders = data.environments.map((e: {order: number}) => e.order);
    const sortedOrders = [...orders].sort((a, b) => a - b);
    expect(orders).toEqual(sortedOrders);
  });

  it('should work with project-scoped API key', async () => {
    // Create another project
    const {projectId: otherProjectId} = await fixture.engine.useCases.createProject(
      GLOBAL_CONTEXT,
      {
        identity: fixture.identity,
        workspaceId: fixture.workspaceId,
        name: 'Other Project',
        description: 'Other project',
      },
    );

    // Create API key with access to both projects
    const {token} = await fixture.createAdminApiKey({
      scopes: ['environment:read'],
      projectIds: [fixture.projectId, otherProjectId],
    });

    const response = await fixture.adminApiRequest(
      'GET',
      `/projects/${fixture.projectId}/environments`,
      token,
    );

    expect(response.status).toBe(200);
    const data = await response.json();
    expect(data.environments.length).toBeGreaterThan(0);
  });
});

