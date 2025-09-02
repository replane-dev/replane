import {GLOBAL_CONTEXT} from '@/engine/core/context';
import {BadRequestError} from '@/engine/core/errors';
import type {GetConfigResponse} from '@/engine/core/use-cases/get-config-use-case';
import {describe} from 'node:test';
import {expect, it} from 'vitest';
import {TEST_USER_ID, useAppFixture} from './fixtures/trpc-fixture';

const TEST_USER_EMAIL = 'test@example.com';

describe('updateConfig', () => {
  const fixture = useAppFixture({authEmail: TEST_USER_EMAIL});

  it('should update an existing config value', async () => {
    await fixture.engine.useCases.createConfig(GLOBAL_CONTEXT, {
      name: 'upd_config',
      value: {enabled: false},
      schema: {type: 'object', properties: {enabled: {type: 'boolean'}}},
      description: 'An updated config for testing',
      currentUserEmail: TEST_USER_EMAIL,
      editorEmails: [],
      ownerEmails: [],
    });

    await fixture.engine.useCases.updateConfig(GLOBAL_CONTEXT, {
      configName: 'upd_config',
      schema: {
        type: 'object',
        properties: {enabled: {type: 'boolean'}, threshold: {type: 'number'}},
      },
      value: {enabled: true, threshold: 5},
      currentUserEmail: TEST_USER_EMAIL,
      editorEmails: [],
      ownerEmails: [],
    });

    const {config} = await fixture.trpc.getConfig({name: 'upd_config'});

    expect(config).toEqual({
      name: 'upd_config',
      value: {enabled: true, threshold: 5},
      createdAt: fixture.now,
      updatedAt: fixture.now,
      schema: {
        type: 'object',
        properties: {enabled: {type: 'boolean'}, threshold: {type: 'number'}},
      },
      description: 'An updated config for testing',
      creatorId: TEST_USER_ID,
      id: expect.any(String),
    } satisfies GetConfigResponse['config']);
  });

  it('should throw BadRequestError when config does not exist', async () => {
    await expect(
      fixture.engine.useCases.updateConfig(GLOBAL_CONTEXT, {
        configName: 'missing_config',
        schema: {
          type: 'object',
          properties: {enabled: {type: 'boolean'}, threshold: {type: 'number'}},
        },
        value: 'anything',
        currentUserEmail: TEST_USER_EMAIL,
        editorEmails: [],
        ownerEmails: [],
      }),
    ).rejects.toBeInstanceOf(BadRequestError);
  });

  it('should throw BadRequestError when new value does not conform to schema', async () => {
    await expect(
      fixture.engine.useCases.updateConfig(GLOBAL_CONTEXT, {
        configName: 'upd_config',
        schema: {
          type: 'object',
          properties: {enabled: {type: 'boolean'}, threshold: {type: 'number'}},
        },
        value: {enabled: true, threshold: 'not_a_number'},
        currentUserEmail: TEST_USER_EMAIL,
        editorEmails: [],
        ownerEmails: [],
      }),
    ).rejects.toBeInstanceOf(BadRequestError);
  });
});
