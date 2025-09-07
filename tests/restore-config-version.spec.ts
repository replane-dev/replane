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

  it('creates audit message (config_version_restored)', async () => {
    await fx.engine.useCases.createConfig(GLOBAL_CONTEXT, {
      name: 'restore-audit',
      description: 'initial',
      value: {a: 1},
      schema: null,
      ownerEmails: [TEST_USER_EMAIL],
      editorEmails: [],
      currentUserEmail: TEST_USER_EMAIL,
    });
    const v1 = await fx.trpc.getConfig({name: 'restore-audit'});
    await fx.engine.useCases.patchConfig(GLOBAL_CONTEXT, {
      configId: v1.config!.config.id,
      prevVersion: v1.config!.config.version,
      value: {newValue: {a: 2}},
      currentUserEmail: TEST_USER_EMAIL,
    });
    const v2 = await fx.trpc.getConfig({name: 'restore-audit'});
    await fx.trpc.restoreConfigVersion({
      name: 'restore-audit',
      versionToRestore: 1,
      expectedCurrentVersion: v2.config!.config.version,
    });
    const messages = await fx.engine.testing.auditMessages.list({
      lte: new Date('2100-01-01T00:00:00Z'),
      limit: 20,
      orderBy: 'created_at desc, id desc',
    });
    const types = messages.map(m => (m as any).payload.type).sort();
    expect(types).toEqual(['config_created', 'config_updated', 'config_version_restored']);
    const restored = messages.find(
      m => (m as any).payload.type === 'config_version_restored',
    ) as any;
    expect(restored.payload.restoredFromVersion).toBe(1);
    // before was version 2 with value {a:2}, after is version 3 with value {a:1}
    expect(restored.payload.before.value).toEqual({a: 2});
    expect(restored.payload.after.value).toEqual({a: 1});
    expect(restored.payload.after.version).toBe(restored.payload.before.version + 1);
  });
});
