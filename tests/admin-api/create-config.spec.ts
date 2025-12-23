import {describe, expect, it} from 'vitest';
import {useAppFixture} from '../fixtures/app-fixture';

const CURRENT_USER_EMAIL = 'test@example.com';

describe('Admin API - Create Config', () => {
  const fixture = useAppFixture({authEmail: CURRENT_USER_EMAIL});

  it('should create config with config:write scope', async () => {
    const {token} = await fixture.createAdminApiKey({
      scopes: ['config:write', 'config:read'],
    });

    const response = await fixture.adminApiRequest(
      'POST',
      `/projects/${fixture.projectId}/configs`,
      token,
      {
        name: 'api-created-config',
        description: 'Created via Admin API',
        value: {enabled: true, count: 10},
      },
    );

    expect(response.status).toBe(201);
    const data = await response.json();
    expect(data.id).toBeDefined();
    expect(data.name).toBe('api-created-config');
  });

  it('should return 403 without config:write scope', async () => {
    const {token} = await fixture.createAdminApiKey({
      scopes: ['config:read'],
    });

    const response = await fixture.adminApiRequest(
      'POST',
      `/projects/${fixture.projectId}/configs`,
      token,
      {
        name: 'should-fail',
        value: true,
      },
    );

    expect(response.status).toBe(403);
  });

  it('should create config with schema', async () => {
    const {token} = await fixture.createAdminApiKey({
      scopes: ['config:write', 'config:read'],
    });

    const response = await fixture.adminApiRequest(
      'POST',
      `/projects/${fixture.projectId}/configs`,
      token,
      {
        name: 'config-with-schema',
        value: {enabled: true},
        schema: {
          type: 'object',
          properties: {
            enabled: {type: 'boolean'},
          },
        },
      },
    );

    expect(response.status).toBe(201);

    // Verify the config was created with schema
    const getResponse = await fixture.adminApiRequest(
      'GET',
      `/projects/${fixture.projectId}/configs/config-with-schema`,
      token,
    );
    expect(getResponse.status).toBe(200);
    const configData = await getResponse.json();
    expect(configData.value).toEqual({enabled: true});
  });

  it('should return 400 for duplicate config name', async () => {
    const {token} = await fixture.createAdminApiKey({
      scopes: ['config:write'],
    });

    // Create first config
    await fixture.adminApiRequest('POST', `/projects/${fixture.projectId}/configs`, token, {
      name: 'duplicate-config',
      value: 'first',
    });

    // Try to create duplicate
    const response = await fixture.adminApiRequest(
      'POST',
      `/projects/${fixture.projectId}/configs`,
      token,
      {
        name: 'duplicate-config',
        value: 'second',
      },
    );

    expect(response.status).toBe(400);
    const data = await response.json();
    expect(data.error).toContain('already exists');
  });

  it('should create config with various value types', async () => {
    const {token} = await fixture.createAdminApiKey({
      scopes: ['config:write', 'config:read'],
    });

    const testCases = [
      {name: 'string-config', value: 'hello world'},
      {name: 'number-config', value: 42},
      {name: 'boolean-config', value: false},
      {name: 'array-config', value: [1, 2, 3]},
      {name: 'object-config', value: {nested: {deep: true}}},
    ];

    for (const testCase of testCases) {
      const response = await fixture.adminApiRequest(
        'POST',
        `/projects/${fixture.projectId}/configs`,
        token,
        testCase,
      );
      expect(response.status).toBe(201);

      // Verify value
      const getResponse = await fixture.adminApiRequest(
        'GET',
        `/projects/${fixture.projectId}/configs/${testCase.name}`,
        token,
      );
      const configData = await getResponse.json();
      expect(configData.value).toEqual(testCase.value);
    }
  });
});

