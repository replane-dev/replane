import {GLOBAL_CONTEXT} from '@/engine/core/context';
import {normalizeEmail} from '@/engine/core/utils';
import {describe, expect, it} from 'vitest';
import {useAppFixture} from './fixtures/trpc-fixture';

const TEST_USER_EMAIL = normalizeEmail('user@example.com');

describe('restore-config-version', () => {
  const fx = useAppFixture({authEmail: TEST_USER_EMAIL});

  it('restores an old version creating a new version with same contents', async () => {
    await fx.engine.useCases.createConfig(GLOBAL_CONTEXT, {
      name: 'restore-demo',
      description: 'initial',
      value: {a: 1},
      schema: null,
      ownerEmails: [TEST_USER_EMAIL],
      editorEmails: [],
      currentUserEmail: TEST_USER_EMAIL,
    });

    const configV1 = await fx.trpc.getConfig({name: 'restore-demo'});
    const prevVersion = configV1.config!.config.version as number;

    await fx.engine.useCases.patchConfig(GLOBAL_CONTEXT, {
      configId: configV1.config!.config.id,
      prevVersion,
      value: {newValue: {a: 2}},
      currentUserEmail: TEST_USER_EMAIL,
    });

    const configV2 = await fx.trpc.getConfig({name: 'restore-demo'});
    expect(configV2.config!.config.version).toBe(prevVersion + 1);
    expect(configV2.config!.config.value).toEqual({a: 2});

    await fx.trpc.restoreConfigVersion({
      name: 'restore-demo',
      versionToRestore: 1,
      expectedCurrentVersion: configV2.config!.config.version,
    });

    const configV3 = await fx.trpc.getConfig({name: 'restore-demo'});
    expect(configV3.config!.config.version).toBe(configV2.config!.config.version + 1);
    expect(configV3.config!.config.value).toEqual({a: 1});

    const version3 = await fx.trpc.getConfigVersion({
      name: 'restore-demo',
      version: configV3.config!.config.version,
    });
    expect(version3.version?.value).toEqual({a: 1});
  });
});
