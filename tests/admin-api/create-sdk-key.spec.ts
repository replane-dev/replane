import {GLOBAL_CONTEXT} from '@/engine/core/context';
import {describe, expect, it} from 'vitest';
import {useAppFixture} from '../fixtures/app-fixture';

const CURRENT_USER_EMAIL = 'test@example.com';

describe('Admin API - Create SDK Key', () => {
  const fixture = useAppFixture({authEmail: CURRENT_USER_EMAIL});

  it('should create SDK key with sdk_key:write scope', async () => {
    const {token} = await fixture.createAdminApiKey({
      scopes: ['sdk_key:write', 'sdk_key:read'],
    });

    const response = await fixture.adminApiRequest(
      'POST',
      `/projects/${fixture.projectId}/sdk-keys`,
      token,
      {
        name: 'Test SDK Key',
        description: 'Created via API',
        environmentId: fixture.productionEnvironmentId,
      },
    );

    expect(response.status).toBe(201);
    const data = await response.json();
    expect(data.id).toBeDefined();
    expect(data.name).toBe('Test SDK Key');
    expect(data.description).toBe('Created via API');
    expect(data.environmentId).toBe(fixture.productionEnvironmentId);
    expect(data.key).toBeDefined();
    expect(data.key.startsWith('rp_')).toBe(true);
    expect(data.createdAt).toBeDefined();
  });

  it('should return 403 without sdk_key:write scope', async () => {
    const {token} = await fixture.createAdminApiKey({
      scopes: ['sdk_key:read'], // Read only
    });

    const response = await fixture.adminApiRequest(
      'POST',
      `/projects/${fixture.projectId}/sdk-keys`,
      token,
      {
        name: 'Test SDK Key',
        environmentId: fixture.productionEnvironmentId,
      },
    );

    expect(response.status).toBe(403);
  });

  it('should return 403 when API key does not have project access', async () => {
    // Create a second project
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
      scopes: ['sdk_key:write'],
      projectIds: [otherProjectId],
    });

    const response = await fixture.adminApiRequest(
      'POST',
      `/projects/${fixture.projectId}/sdk-keys`,
      token,
      {
        name: 'Test SDK Key',
        environmentId: fixture.productionEnvironmentId,
      },
    );

    expect(response.status).toBe(403);
  });

  it('should return 400 for invalid environment ID', async () => {
    const {token} = await fixture.createAdminApiKey({
      scopes: ['sdk_key:write'],
    });

    const response = await fixture.adminApiRequest(
      'POST',
      `/projects/${fixture.projectId}/sdk-keys`,
      token,
      {
        name: 'Test SDK Key',
        environmentId: '00000000-0000-0000-0000-000000000000', // Non-existent
      },
    );

    expect(response.status).toBe(400);
    const data = await response.json();
    expect(data.error).toBe('Environment not found');
  });

  it('should return 400 when using environment from another project', async () => {
    // Create a second project with its own environments
    const {environments: otherEnvs} = await fixture.engine.useCases.createProject(GLOBAL_CONTEXT, {
      identity: fixture.identity,
      workspaceId: fixture.workspaceId,
      name: 'Other Project',
      description: 'Other project',
    });

    const otherProductionEnvId = otherEnvs.find(e => e.name === 'Production')?.id;

    const {token} = await fixture.createAdminApiKey({
      scopes: ['sdk_key:write'],
      projectIds: null, // Access to all projects
    });

    // Try to create an SDK key in the first project using an environment from the second project
    const response = await fixture.adminApiRequest(
      'POST',
      `/projects/${fixture.projectId}/sdk-keys`,
      token,
      {
        name: 'Cross-Project SDK Key',
        environmentId: otherProductionEnvId, // Environment from other project
      },
    );

    expect(response.status).toBe(400);
    const data = await response.json();
    expect(data.error).toBe('Environment not found');
  });

  it('should create SDK key with minimal fields', async () => {
    const {token} = await fixture.createAdminApiKey({
      scopes: ['sdk_key:write'],
    });

    const response = await fixture.adminApiRequest(
      'POST',
      `/projects/${fixture.projectId}/sdk-keys`,
      token,
      {
        name: 'Minimal Key',
        environmentId: fixture.developmentEnvironmentId,
      },
    );

    expect(response.status).toBe(201);
    const data = await response.json();
    expect(data.name).toBe('Minimal Key');
    expect(data.description).toBe('');
  });

  it('should allow creating multiple SDK keys for same environment', async () => {
    const {token} = await fixture.createAdminApiKey({
      scopes: ['sdk_key:write', 'sdk_key:read'],
    });

    // Create first key
    const response1 = await fixture.adminApiRequest(
      'POST',
      `/projects/${fixture.projectId}/sdk-keys`,
      token,
      {
        name: 'Key 1',
        environmentId: fixture.productionEnvironmentId,
      },
    );
    expect(response1.status).toBe(201);

    // Create second key
    const response2 = await fixture.adminApiRequest(
      'POST',
      `/projects/${fixture.projectId}/sdk-keys`,
      token,
      {
        name: 'Key 2',
        environmentId: fixture.productionEnvironmentId,
      },
    );
    expect(response2.status).toBe(201);

    // Verify both exist
    const listResponse = await fixture.adminApiRequest(
      'GET',
      `/projects/${fixture.projectId}/sdk-keys`,
      token,
    );
    expect(listResponse.status).toBe(200);
    const listData = await listResponse.json();
    expect(listData.sdkKeys.length).toBe(2);
  });
});

