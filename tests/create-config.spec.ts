import {GLOBAL_CONTEXT} from '@/engine/core/context';
import {BadRequestError} from '@/engine/core/errors';
import type {GetConfigResponse} from '@/engine/core/use-cases/get-config-use-case';
import {describe} from 'node:test';
import {expect, it} from 'vitest';
import {useAppFixture} from './fixtures/trpc-fixture';

describe('createConfig', () => {
  const fixture = useAppFixture({authEmail: 'test@example.com'});

  it('should create a new config', async () => {
    await fixture.engine.useCases.createConfig(GLOBAL_CONTEXT, {name: 'new_config', value: {flag: true}});

    const {config} = await fixture.trpc.getConfig({name: 'new_config'});

    expect(config).toEqual({
      name: 'new_config',
      value: {flag: true},
      createdAt: fixture.now,
      updatedAt: fixture.now,
    } satisfies GetConfigResponse['config']);
  });

  it('should throw BadRequestError when config with this name already exists', async () => {
    await fixture.engine.useCases.createConfig(GLOBAL_CONTEXT, {
      name: 'dup_config',
      value: 'v1',
    });

    await expect(
      fixture.engine.useCases.createConfig(GLOBAL_CONTEXT, {
        name: 'dup_config',
        value: 'v2',
      }),
    ).rejects.toBeInstanceOf(BadRequestError);

    const {config} = await fixture.trpc.getConfig({name: 'dup_config'});

    expect(config).toEqual({
      name: 'dup_config',
      value: 'v1',
      createdAt: fixture.now,
      updatedAt: fixture.now,
    } satisfies GetConfigResponse['config']);
  });
});
