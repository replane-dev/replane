import {afterEach, beforeEach, describe, expect, it} from 'vitest';
import type {ConfigChangePayload} from '../src/engine/core/config-store';
import {ConfigsReplica} from '../src/engine/core/configs-replica';
import {CONFIGS_CHANGES_CHANNEL} from '../src/engine/core/constants';
import {InMemoryListener} from '../src/engine/core/in-memory-listener';
import type {Logger} from '../src/engine/core/logger';
import {createLogger} from '../src/engine/core/logger';

function sleep(ms: number) {
  return new Promise(r => setTimeout(r, ms));
}

describe('ConfigsReplica with InMemoryListener', () => {
  let logger: Logger;

  beforeEach(() => {
    logger = createLogger({level: 'silent'});
  });

  afterEach(() => {
    // nothing
  });

  it('loads initial dump on start and updates on notify', async () => {
    const id = 'cfg-1';
    const projectId = 'proj-1';
    const name = 'featureFlag';
    let currentValue: any = {on: false};

    const configs = {
      async getReplicaDump() {
        return [{id, name, projectId, value: currentValue, version: 1}];
      },
      async getReplicaConfig(cfgId: string) {
        if (cfgId !== id) return null;
        return {name, projectId, value: currentValue, version: 1};
      },
    } as any;

    // capture the in-memory listener to emit notifications
    let mem: InMemoryListener<ConfigChangePayload> | null = null;

    const replica = new ConfigsReplica({
      pool: {} as any,
      configs,
      logger,
      // Inject a listener factory mirroring PgListener constructor semantics
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      // @ts-ignore accessing private signature for test
      createListener: (onNotification: any) => {
        mem = new InMemoryListener<ConfigChangePayload>({
          channels: [CONFIGS_CHANGES_CHANNEL],
          onNotification,
          parsePayload: true,
          logger: console,
        });
        return mem!;
      },
    } as any);

    await replica.start();

    // initial full refresh happens on start
    // give worker a tick to process
    await sleep(10);
    expect(replica.getConfigValue<{on: boolean}>({projectId, name})).toEqual({on: false});

    // simulate an update notification
    currentValue = {on: true};
    await mem!.start(); // ensure started (replica.start() calls start on listener too)
    await mem!.notify(CONFIGS_CHANGES_CHANNEL, JSON.stringify({configId: id}));
    await sleep(10);
    expect(replica.getConfigValue<{on: boolean}>({projectId, name})).toEqual({on: true});

    await replica.stop();
  });

  it('removes config on delete notification', async () => {
    const id = 'cfg-2';
    const projectId = 'proj-1';
    const name = 'toDelete';
    let exists = true;

    const configs = {
      async getReplicaDump() {
        return exists ? [{id, name, projectId, value: 1, version: 1}] : [];
      },
      async getReplicaConfig(cfgId: string) {
        if (cfgId !== id) return null;
        return exists ? {name, projectId, value: 1, version: 1} : null;
      },
    } as any;

    let mem: InMemoryListener<ConfigChangePayload> | null = null;

    const replica = new ConfigsReplica({
      pool: {} as any,
      configs,
      logger,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      // @ts-ignore accessing private signature for test
      createListener: (onNotification: any) => {
        mem = new InMemoryListener<ConfigChangePayload>({
          channels: [CONFIGS_CHANGES_CHANNEL],
          onNotification,
          parsePayload: true,
          logger: console,
        });
        return mem!;
      },
    } as any);

    await replica.start();
    await sleep(10);
    expect(replica.getConfigValue<number>({projectId, name})).toBe(1);

    // now delete and notify
    exists = false;
    await mem!.notify(CONFIGS_CHANGES_CHANNEL, JSON.stringify({configId: id}));
    await sleep(10);
    expect(replica.getConfigValue<number>({projectId, name})).toBeUndefined();

    await replica.stop();
  });

  it('processes multiple queued notifications for different ids', async () => {
    const a = {id: 'cfg-a', name: 'A', projectId: 'p', version: 1};
    const b = {id: 'cfg-b', name: 'B', projectId: 'p', version: 1};
    let valueA: any = 10;
    let valueB: any = 20;

    const configs = {
      async getReplicaDump() {
        return [];
      },
      async getReplicaConfig(cfgId: string) {
        if (cfgId === a.id)
          return {name: a.name, projectId: a.projectId, value: valueA, version: a.version};
        if (cfgId === b.id)
          return {name: b.name, projectId: b.projectId, value: valueB, version: b.version};
        return null;
      },
    } as any;

    let mem: InMemoryListener<ConfigChangePayload> | null = null;
    const replica = new ConfigsReplica({
      pool: {} as any,
      configs,
      logger,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      // @ts-ignore accessing private signature for test
      createListener: (onNotification: any) => {
        mem = new InMemoryListener<ConfigChangePayload>({
          channels: [CONFIGS_CHANGES_CHANNEL],
          onNotification,
          parsePayload: true,
          logger: console,
        });
        return mem!;
      },
    } as any);

    await replica.start();
    await sleep(10);
    expect(replica.getConfigValue<number>({projectId: a.projectId, name: a.name})).toBeUndefined();
    expect(replica.getConfigValue<number>({projectId: b.projectId, name: b.name})).toBeUndefined();

    await mem!.notify(CONFIGS_CHANGES_CHANNEL, JSON.stringify({configId: a.id}));
    await mem!.notify(CONFIGS_CHANGES_CHANNEL, JSON.stringify({configId: b.id}));
    await sleep(20);

    expect(replica.getConfigValue<number>({projectId: a.projectId, name: a.name})).toBe(10);
    expect(replica.getConfigValue<number>({projectId: b.projectId, name: b.name})).toBe(20);

    // update values and notify again
    valueA = 11;
    valueB = 22;
    await mem!.notify(CONFIGS_CHANGES_CHANNEL, JSON.stringify({configId: b.id}));
    await mem!.notify(CONFIGS_CHANGES_CHANNEL, JSON.stringify({configId: a.id}));
    await sleep(20);

    expect(replica.getConfigValue<number>({projectId: a.projectId, name: a.name})).toBe(11);
    expect(replica.getConfigValue<number>({projectId: b.projectId, name: b.name})).toBe(22);

    await replica.stop();
  });

  it('ignores notifications on unknown channels', async () => {
    const id = 'cfg-x';
    const projectId = 'p';
    const name = 'X';
    let val: any = 1;

    const configs = {
      async getReplicaDump() {
        return [];
      },
      async getReplicaConfig(cfgId: string) {
        if (cfgId !== id) return null;
        return {name, projectId, value: val, version: 1};
      },
    } as any;

    let mem: InMemoryListener<ConfigChangePayload> | null = null;
    const replica = new ConfigsReplica({
      pool: {} as any,
      configs,
      logger,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      // @ts-ignore accessing private signature for test
      createListener: (onNotification: any) => {
        mem = new InMemoryListener<ConfigChangePayload>({
          channels: [CONFIGS_CHANGES_CHANNEL],
          onNotification,
          parsePayload: true,
          logger: console,
        });
        return mem!;
      },
    } as any);

    await replica.start();
    await sleep(10);
    expect(replica.getConfigValue<number>({projectId, name})).toBeUndefined();

    await mem!.notify('unknown_channel', JSON.stringify({configId: id}));
    await sleep(10);
    expect(replica.getConfigValue<number>({projectId, name})).toBeUndefined();

    await mem!.notify(CONFIGS_CHANGES_CHANNEL, JSON.stringify({configId: id}));
    await sleep(10);
    expect(replica.getConfigValue<number>({projectId, name})).toBe(1);

    val = 2;
    await mem!.notify(CONFIGS_CHANGES_CHANNEL, JSON.stringify({configId: id}));
    await sleep(10);
    expect(replica.getConfigValue<number>({projectId, name})).toBe(2);

    await replica.stop();
  });
});
