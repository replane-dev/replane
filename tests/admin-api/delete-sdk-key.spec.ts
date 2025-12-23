import {GLOBAL_CONTEXT} from '@/engine/core/context';
import {describe, expect, it} from 'vitest';
import {useAppFixture} from '../fixtures/app-fixture';

const CURRENT_USER_EMAIL = 'test@example.com';

describe('Admin API - Delete SDK Key', () => {
  const fixture = useAppFixture({authEmail: CURRENT_USER_EMAIL});

  it('should delete SDK key with sdk_key:write scope', async () => {
    // First create an SDK key
    const createResult = await fixture.engine.useCases.createSdkKey(GLOBAL_CONTEXT, {
      identity: fixture.identity,
      projectId: fixture.projectId,
      environmentId: fixture.productionEnvironmentId,
      name: 'Key to Delete',
      description: 'Will be deleted',
    });

    const {token} = await fixture.createAdminApiKey({
      scopes: ['sdk_key:write', 'sdk_key:read'],
    });

    const response = await fixture.adminApiRequest(
      'DELETE',
      `/projects/${fixture.projectId}/sdk-keys/${createResult.sdkKey.id}`,
      token,
    );

    expect(response.status).toBe(204);

    // Verify it's deleted
    const listResponse = await fixture.adminApiRequest(
      'GET',
      `/projects/${fixture.projectId}/sdk-keys`,
      token,
    );
    const listData = await listResponse.json();
    expect(listData.sdkKeys.find((k: {id: string}) => k.id === createResult.sdkKey.id)).toBeUndefined();
  });

  it('should return 403 without sdk_key:write scope', async () => {
    // First create an SDK key
    const createResult = await fixture.engine.useCases.createSdkKey(GLOBAL_CONTEXT, {
      identity: fixture.identity,
      projectId: fixture.projectId,
      environmentId: fixture.productionEnvironmentId,
      name: 'Key to Delete',
      description: 'Will be deleted',
    });

    const {token} = await fixture.createAdminApiKey({
      scopes: ['sdk_key:read'], // Read only
    });

    const response = await fixture.adminApiRequest(
      'DELETE',
      `/projects/${fixture.projectId}/sdk-keys/${createResult.sdkKey.id}`,
      token,
    );

    expect(response.status).toBe(403);
  });

  it('should return 403 when API key does not have project access', async () => {
    // First create an SDK key
    const createResult = await fixture.engine.useCases.createSdkKey(GLOBAL_CONTEXT, {
      identity: fixture.identity,
      projectId: fixture.projectId,
      environmentId: fixture.productionEnvironmentId,
      name: 'Key to Delete',
      description: 'Will be deleted',
    });

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
      'DELETE',
      `/projects/${fixture.projectId}/sdk-keys/${createResult.sdkKey.id}`,
      token,
    );

    expect(response.status).toBe(403);
  });

  it('should return 400 for non-existent SDK key', async () => {
    const {token} = await fixture.createAdminApiKey({
      scopes: ['sdk_key:write'],
    });

    const nonExistentId = '00000000-0000-0000-0000-000000000000';
    const response = await fixture.adminApiRequest(
      'DELETE',
      `/projects/${fixture.projectId}/sdk-keys/${nonExistentId}`,
      token,
    );

    expect(response.status).toBe(400);
    const data = await response.json();
    expect(data.error).toBe('SDK key not found');
  });

  it('should work with project-scoped API key', async () => {
    // First create an SDK key
    const createResult = await fixture.engine.useCases.createSdkKey(GLOBAL_CONTEXT, {
      identity: fixture.identity,
      projectId: fixture.projectId,
      environmentId: fixture.productionEnvironmentId,
      name: 'Key to Delete',
      description: 'Will be deleted',
    });

    // Create API key with access to this specific project
    const {token} = await fixture.createAdminApiKey({
      scopes: ['sdk_key:write'],
      projectIds: [fixture.projectId],
    });

    const response = await fixture.adminApiRequest(
      'DELETE',
      `/projects/${fixture.projectId}/sdk-keys/${createResult.sdkKey.id}`,
      token,
    );

    expect(response.status).toBe(204);
  });
});

