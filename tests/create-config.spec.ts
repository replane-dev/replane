import {GLOBAL_CONTEXT} from '@/engine/core/context';
import {BadRequestError} from '@/engine/core/errors';
import type {GetConfigResponse} from '@/engine/core/use-cases/get-config-use-case';
import {describe} from 'node:test';
import {expect, it} from 'vitest';
import {TEST_USER_ID, useAppFixture} from './fixtures/trpc-fixture';

const CURRENT_USER_EMAIL = 'test@example.com';

describe('createConfig', () => {
  const fixture = useAppFixture({authEmail: CURRENT_USER_EMAIL});

  it('should create a new config', async () => {
    await fixture.engine.useCases.createConfig(GLOBAL_CONTEXT, {
      name: 'new_config',
      value: {flag: true},
      schema: {type: 'object', properties: {flag: {type: 'boolean'}}},
      description: 'A new config for testing',
      currentUserEmail: CURRENT_USER_EMAIL,
      editorEmails: [],
      ownerEmails: [],
    });

    const {config} = await fixture.trpc.getConfig({name: 'new_config'});

    expect(config).toEqual({
      name: 'new_config',
      value: {flag: true},
      schema: {type: 'object', properties: {flag: {type: 'boolean'}}},
      createdAt: fixture.now,
      updatedAt: fixture.now,
      description: 'A new config for testing',
      creatorId: TEST_USER_ID,
      id: expect.any(String),
    } satisfies GetConfigResponse['config']);
  });

  it('should throw BadRequestError when config with this name already exists', async () => {
    await fixture.engine.useCases.createConfig(GLOBAL_CONTEXT, {
      name: 'dup_config',
      value: 'v1',
      schema: {type: 'string'},
      description: 'A duplicate config for testing v1',
      currentUserEmail: CURRENT_USER_EMAIL,
      editorEmails: [],
      ownerEmails: [],
    });

    await expect(
      fixture.engine.useCases.createConfig(GLOBAL_CONTEXT, {
        name: 'dup_config',
        value: 'v2',
        schema: {type: 'string'},
        description: 'A duplicate config for testing v2',
        currentUserEmail: CURRENT_USER_EMAIL,
        editorEmails: [],
        ownerEmails: [],
      }),
    ).rejects.toBeInstanceOf(BadRequestError);

    const {config} = await fixture.trpc.getConfig({name: 'dup_config'});

    expect(config).toEqual({
      name: 'dup_config',
      value: 'v1',
      schema: {type: 'string'},
      createdAt: fixture.now,
      updatedAt: fixture.now,
      description: 'A duplicate config for testing v1',
      creatorId: TEST_USER_ID,
      id: expect.any(String),
    } satisfies GetConfigResponse['config']);
  });

  it('should accept config without a schema', async () => {
    await fixture.engine.useCases.createConfig(GLOBAL_CONTEXT, {
      name: 'no_schema_config',
      value: 'v1',
      schema: null,
      description: 'A config without a schema',
      currentUserEmail: CURRENT_USER_EMAIL,
      editorEmails: [],
      ownerEmails: [],
    });

    const {config} = await fixture.trpc.getConfig({name: 'no_schema_config'});

    expect(config).toEqual({
      name: 'no_schema_config',
      value: 'v1',
      schema: null,
      createdAt: fixture.now,
      updatedAt: fixture.now,
      description: 'A config without a schema',
      creatorId: TEST_USER_ID,
      id: expect.any(String),
    } satisfies GetConfigResponse['config']);
  });

  it('should validate that config value matches schema', async () => {
    await fixture.engine.useCases.createConfig(GLOBAL_CONTEXT, {
      name: 'schema_validation_config',
      value: {flag: true},
      schema: {type: 'object', properties: {flag: {type: 'boolean'}}},
      description: 'A config for testing schema validation',
      currentUserEmail: CURRENT_USER_EMAIL,
      editorEmails: [],
      ownerEmails: [],
    });

    await expect(
      fixture.engine.useCases.updateConfig(GLOBAL_CONTEXT, {
        configName: 'schema_validation_config',
        value: {flag: 'not_a_boolean'},
        schema: {type: 'object', properties: {flag: {type: 'boolean'}}},
        description: 'An updated config with invalid value',
        currentUserEmail: CURRENT_USER_EMAIL,
        editorEmails: [],
        ownerEmails: [],
      }),
    ).rejects.toBeInstanceOf(BadRequestError);
  });
});
