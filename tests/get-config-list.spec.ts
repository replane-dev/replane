import {GLOBAL_CONTEXT} from '@/engine/core/context';
import type {GetConfigListResponse} from '@/engine/core/use-cases/get-config-list-use-case';
import {normalizeEmail} from '@/engine/core/utils';
import {describe} from 'node:test';
import {expect, it} from 'vitest';
import {useAppFixture} from './fixtures/trpc-fixture';

const TEST_USER_EMAIL = normalizeEmail('test@example.com');

describe('getConfigList', () => {
  const fixture = useAppFixture({authEmail: TEST_USER_EMAIL});

  it('should return empty list when there are no configs', async () => {
    const {configs} = await fixture.trpc.getConfigList();

    expect(configs).toEqual([]);
  });

  it('should return all existing configs', async () => {
    await fixture.engine.useCases.createConfig(GLOBAL_CONTEXT, {
      name: 'first-config',
      value: 'first-value',
      schema: {type: 'string'},
      description: 'The first config',
      currentUserEmail: TEST_USER_EMAIL,
      editorEmails: [],
      ownerEmails: [],
    });
    await fixture.engine.useCases.createConfig(GLOBAL_CONTEXT, {
      name: 'second-config',
      value: {nested: 42},
      schema: {type: 'object', properties: {nested: {type: 'number'}}},
      description: 'The second config',
      currentUserEmail: TEST_USER_EMAIL,
      editorEmails: [],
      ownerEmails: [],
    });

    const {configs} = await fixture.trpc.getConfigList();

    expect(configs).toEqual([
      {
        name: 'first-config',
        createdAt: fixture.now,
        updatedAt: fixture.now,
        descriptionPreview: 'The first config',
      },
      {
        name: 'second-config',
        createdAt: fixture.now,
        updatedAt: fixture.now,
        descriptionPreview: 'The second config',
      },
    ] satisfies GetConfigListResponse['configs']);
    expect(configs.length).toBe(2);
  });
});
