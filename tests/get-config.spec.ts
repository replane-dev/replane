import {GLOBAL_CONTEXT} from '@/engine/core/context';
import {describe} from 'node:test';
import {expect, it} from 'vitest';
import {useAppFixture} from './fixtures/trpc-fixture';

describe('getConfig', () => {
  const fixture = useAppFixture({authEmail: 'test@example.com'});

  it('should return requested config', async () => {
    await fixture.engine.useCases.createConfig(GLOBAL_CONTEXT, {
      config: {
        name: 'test-config',
        value: 'test-value',
      },
    });
    const {config} = await fixture.trpc.getConfig({name: 'test-config'});

    expect(config).toEqual({name: 'test-config', value: 'test-value'});
  });

  it('should return undefined if config does not exist', async () => {
    const {config} = await fixture.trpc.getConfig({name: 'non-existent-config'});

    expect(config).toBeUndefined();
  });
});
