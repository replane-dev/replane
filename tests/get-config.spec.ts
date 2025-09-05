import {GLOBAL_CONTEXT} from '@/engine/core/context';
import type {GetConfigResponse} from '@/engine/core/use-cases/get-config-use-case';
import {normalizeEmail} from '@/engine/core/utils';
import {describe} from 'node:test';
import {expect, it} from 'vitest';
import {TEST_USER_ID, useAppFixture} from './fixtures/trpc-fixture';

const TEST_USER_EMAIL = normalizeEmail('test@example.com');

describe('getConfig', () => {
  const fixture = useAppFixture({authEmail: TEST_USER_EMAIL});

  it('should return requested config', async () => {
    await fixture.engine.useCases.createConfig(GLOBAL_CONTEXT, {
      name: 'test-config',
      value: 'test-value',
      schema: {type: 'string'},
      description: 'A test config',
      currentUserEmail: TEST_USER_EMAIL,
      editorEmails: [],
      ownerEmails: [],
    });
    const {config} = await fixture.trpc.getConfig({name: 'test-config'});

    expect(config).toEqual({
      name: 'test-config',
      value: 'test-value',
      createdAt: fixture.now,
      updatedAt: fixture.now,
      schema: {type: 'string'},
      description: 'A test config',
      creatorId: TEST_USER_ID,
      id: expect.any(String),
    } satisfies GetConfigResponse['config']);
  });

  it('should return undefined if config does not exist', async () => {
    const {config} = await fixture.trpc.getConfig({name: 'non-existent-config'});

    expect(config).toBeUndefined();
  });
});
