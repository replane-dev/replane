import {GLOBAL_CONTEXT} from '@/engine/core/context';
import {describe, expect, it} from 'vitest';
import {useAppFixture} from '../fixtures/app-fixture';

const CURRENT_USER_EMAIL = 'test@example.com';

describe('Admin API - List SDK Keys', () => {
  const fixture = useAppFixture({authEmail: CURRENT_USER_EMAIL});

  it('should list SDK keys with sdk_key:read scope', async () => {
    // Create an SDK key first
    await fixture.engine.useCases.createSdkKey(GLOBAL_CONTEXT, {
      identity: fixture.identity,
      projectId: fixture.projectId,
      environmentId: fixture.productionEnvironmentId,
      name: 'Test SDK Key',
      description: 'SDK key for testing',
    });

    const {token} = await fixture.createAdminApiKey({
      scopes: ['sdk_key:read'],
    });

    const response = await fixture.adminApiRequest(
      'GET',
      `/projects/${fixture.projectId}/sdk-keys`,
      token,
    );

    expect(response.status).toBe(200);
    const data = await response.json();
    expect(data.sdkKeys).toHaveLength(1);
    expect(data.sdkKeys[0].name).toBe('Test SDK Key');
    expect(data.sdkKeys[0].description).toBe('SDK key for testing');
    expect(data.sdkKeys[0].environmentId).toBe(fixture.productionEnvironmentId);
    expect(data.sdkKeys[0].environmentName).toBe('Production');
  });

  it('should return 403 without sdk_key:read scope', async () => {
    const {token} = await fixture.createAdminApiKey({
      scopes: ['project:read'],
    });

    const response = await fixture.adminApiRequest(
      'GET',
      `/projects/${fixture.projectId}/sdk-keys`,
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
      scopes: ['sdk_key:read'],
      projectIds: [otherProjectId],
    });

    // Try to access the first project's SDK keys
    const response = await fixture.adminApiRequest(
      'GET',
      `/projects/${fixture.projectId}/sdk-keys`,
      token,
    );

    expect(response.status).toBe(403);
  });

  it('should return empty array when no SDK keys exist', async () => {
    const {token} = await fixture.createAdminApiKey({
      scopes: ['sdk_key:read'],
    });

    const response = await fixture.adminApiRequest(
      'GET',
      `/projects/${fixture.projectId}/sdk-keys`,
      token,
    );

    expect(response.status).toBe(200);
    const data = await response.json();
    expect(data.sdkKeys).toHaveLength(0);
  });

  it('should list multiple SDK keys', async () => {
    // Create SDK keys for different environments
    await fixture.engine.useCases.createSdkKey(GLOBAL_CONTEXT, {
      identity: fixture.identity,
      projectId: fixture.projectId,
      environmentId: fixture.productionEnvironmentId,
      name: 'Production SDK Key',
      description: 'For production',
    });

    await fixture.engine.useCases.createSdkKey(GLOBAL_CONTEXT, {
      identity: fixture.identity,
      projectId: fixture.projectId,
      environmentId: fixture.developmentEnvironmentId,
      name: 'Development SDK Key',
      description: 'For development',
    });

    const {token} = await fixture.createAdminApiKey({
      scopes: ['sdk_key:read'],
    });

    const response = await fixture.adminApiRequest(
      'GET',
      `/projects/${fixture.projectId}/sdk-keys`,
      token,
    );

    expect(response.status).toBe(200);
    const data = await response.json();
    expect(data.sdkKeys).toHaveLength(2);

    const keyNames = data.sdkKeys.map((k: {name: string}) => k.name);
    expect(keyNames).toContain('Production SDK Key');
    expect(keyNames).toContain('Development SDK Key');
  });

  it('should return SDK key with correct properties', async () => {
    await fixture.engine.useCases.createSdkKey(GLOBAL_CONTEXT, {
      identity: fixture.identity,
      projectId: fixture.projectId,
      environmentId: fixture.productionEnvironmentId,
      name: 'Test Key',
      description: 'Test description',
    });

    const {token} = await fixture.createAdminApiKey({
      scopes: ['sdk_key:read'],
    });

    const response = await fixture.adminApiRequest(
      'GET',
      `/projects/${fixture.projectId}/sdk-keys`,
      token,
    );

    expect(response.status).toBe(200);
    const data = await response.json();
    const sdkKey = data.sdkKeys[0];

    expect(sdkKey.id).toBeDefined();
    expect(sdkKey.name).toBe('Test Key');
    expect(sdkKey.description).toBe('Test description');
    expect(sdkKey.environmentId).toBe(fixture.productionEnvironmentId);
    expect(sdkKey.environmentName).toBe('Production');
    expect(sdkKey.createdAt).toBeDefined();
  });
});

