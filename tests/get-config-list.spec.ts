import {GLOBAL_CONTEXT} from '@/engine/core/context';
import type {GetConfigListResponse} from '@/engine/core/use-cases/get-config-list-use-case';
import {describe} from 'node:test';
import {expect, it} from 'vitest';
import {useAppFixture} from './fixtures/trpc-fixture';

describe('getConfigList', () => {
  const fixture = useAppFixture({authEmail: 'test@example.com'});

  it('should return empty list when there are no configs', async () => {
    const {configs} = await fixture.trpc.getConfigList();

    expect(configs).toEqual([]);
  });

  it('should return all existing configs', async () => {
    await fixture.engine.useCases.createConfig(GLOBAL_CONTEXT, {
      name: 'first-config',
      value: 'first-value',
    });
    await fixture.engine.useCases.createConfig(GLOBAL_CONTEXT, {
      name: 'second-config',
      value: {nested: 42},
    });

    const {configs} = await fixture.trpc.getConfigList();

    expect(configs).toEqual([
      {name: 'first-config', createdAt: fixture.now, updatedAt: fixture.now},
      {name: 'second-config', createdAt: fixture.now, updatedAt: fixture.now},
    ] satisfies GetConfigListResponse['configs']);
    expect(configs.length).toBe(2);
  });
});
