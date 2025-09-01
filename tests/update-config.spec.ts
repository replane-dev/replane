import {GLOBAL_CONTEXT} from '@/engine/core/context';
import {BadRequestError} from '@/engine/core/errors';
import {describe} from 'node:test';
import {expect, it} from 'vitest';
import {useAppFixture} from './fixtures/trpc-fixture';

describe('updateConfig', () => {
  const fixture = useAppFixture({authEmail: 'test@example.com'});

  it('should update an existing config value', async () => {
    await fixture.engine.useCases.createConfig(GLOBAL_CONTEXT, {
      config: {name: 'upd_config', value: {enabled: false}},
    });

    await fixture.engine.useCases.updateConfig(GLOBAL_CONTEXT, {
      config: {name: 'upd_config', value: {enabled: true, threshold: 5}},
    });

    const {config} = await fixture.trpc.getConfig({name: 'upd_config'});

    expect(config).toEqual({name: 'upd_config', value: {enabled: true, threshold: 5}});
  });

  it('should throw BadRequestError when config does not exist', async () => {
    await expect(
      fixture.engine.useCases.updateConfig(GLOBAL_CONTEXT, {
        config: {name: 'missing_config', value: 'anything'},
      }),
    ).rejects.toBeInstanceOf(BadRequestError);
  });
});
