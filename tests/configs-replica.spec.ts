import type {EventBusClient} from '@/engine/core/event-bus';
import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest';
import type {ConfigChangePayload} from '../src/engine/core/config-store';
import {type ConfigReplicaEvent, ConfigsReplica} from '../src/engine/core/configs-replica';
import {InMemoryEventBus} from '../src/engine/core/in-memory-event-bus';
import type {Logger} from '../src/engine/core/logger';
import {createLogger} from '../src/engine/core/logger';
import {Subject} from '../src/engine/core/subject';

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
        return [{id, name, projectId, value: currentValue, version: 1, overrides: []}];
      },
      async getReplicaConfig(cfgId: string) {
        if (cfgId !== id) return null;
        return {name, projectId, value: currentValue, version: 1, overrides: []};
      },
    };

    // capture the in-memory listener to emit notifications
    let mem: EventBusClient<ConfigChangePayload> | null = null;

    const replica = new ConfigsReplica({
      pool: {} as any,
      configs: configs as any,
      logger,
      createEventBusClient: (onNotification: any) => {
        mem = new InMemoryEventBus<ConfigChangePayload>({
          logger: console,
        }).createClient(onNotification);
        return mem!;
      },
    });

    await replica.start();

    // initial full refresh happens on start
    // give worker a tick to process
    await sleep(10);
    expect(replica.getConfigValue<{on: boolean}>({projectId, name})).toEqual({on: false});
    // simulate an update notification
    currentValue = {on: true};

    await mem!.notify({configId: id});
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
        return exists ? [{id, name, projectId, value: 1, version: 1, overrides: []}] : [];
      },
      async getReplicaConfig(cfgId: string) {
        if (cfgId !== id) return null;
        return exists ? {name, projectId, value: 1, version: 1, overrides: []} : null;
      },
    };

    let mem: EventBusClient<ConfigChangePayload> | null = null;

    const replica = new ConfigsReplica({
      pool: {} as any,
      configs: configs as any,
      logger,

      createEventBusClient: (onNotification: any) => {
        mem = new InMemoryEventBus<ConfigChangePayload>({
          logger: console,
        }).createClient(onNotification);
        return mem!;
      },
    });

    await replica.start();
    await sleep(10);
    expect(replica.getConfigValue<number>({projectId, name})).toBe(1);

    // now delete and notify
    exists = false;
    await mem!.notify({configId: id});
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
          return {name: a.name, projectId: a.projectId, value: valueA, version: a.version, overrides: []};
        if (cfgId === b.id)
          return {name: b.name, projectId: b.projectId, value: valueB, version: b.version, overrides: []};
        return null;
      },
    };

    let mem: EventBusClient<ConfigChangePayload> | null = null;
    const replica = new ConfigsReplica({
      pool: {} as any,
      configs: configs as any,
      logger,

      createEventBusClient: (onNotification: any) => {
        mem = new InMemoryEventBus<ConfigChangePayload>({
          logger: console,
        }).createClient(onNotification);
        return mem!;
      },
    });

    await replica.start();
    await sleep(10);
    expect(replica.getConfigValue<number>({projectId: a.projectId, name: a.name})).toBeUndefined();
    expect(replica.getConfigValue<number>({projectId: b.projectId, name: b.name})).toBeUndefined();

    await mem!.notify({configId: a.id});
    await mem!.notify({configId: b.id});
    await sleep(20);

    expect(replica.getConfigValue<number>({projectId: a.projectId, name: a.name})).toBe(10);
    expect(replica.getConfigValue<number>({projectId: b.projectId, name: b.name})).toBe(20);

    // update values and notify again
    valueA = 11;
    valueB = 22;
    await mem!.notify({configId: b.id});
    await mem!.notify({configId: a.id});
    await sleep(20);

    expect(replica.getConfigValue<number>({projectId: a.projectId, name: a.name})).toBe(11);
    expect(replica.getConfigValue<number>({projectId: b.projectId, name: b.name})).toBe(22);

    await replica.stop();
  });

  it('publishes events to subject on config changes', async () => {
    const id = 'cfg-events';
    const projectId = 'proj-events';
    const name = 'eventsConfig';
    let currentValue: any = {enabled: false};
    let currentVersion = 1;
    let exists = true;

    const configs = {
      async getReplicaDump() {
        return [];
      },
      async getReplicaConfig(cfgId: string) {
        if (cfgId !== id) return null;
        if (!exists) return null;
        return {name, projectId, value: currentValue, version: currentVersion, overrides: []};
      },
    };

    let mem: EventBusClient<ConfigChangePayload> | null = null;
    const eventsSubject = new Subject<ConfigReplicaEvent>();
    const eventsSpy = vi.fn();

    eventsSubject.subscribe({
      next: eventsSpy,
      error: vi.fn(),
      complete: vi.fn(),
    });

    const replica = new ConfigsReplica({
      pool: {} as any,
      configs: configs as any,
      logger,
      eventsSubject,

      createEventBusClient: (onNotification: any) => {
        mem = new InMemoryEventBus<ConfigChangePayload>({
          logger: console,
        }).createClient(onNotification);
        return mem!;
      },
    });

    await replica.start();
    await sleep(10);

    // Notify about new config - should trigger 'created' event
    await mem!.notify({configId: id});
    await sleep(10);

    expect(eventsSpy).toHaveBeenCalledTimes(1);
    expect(eventsSpy).toHaveBeenCalledWith({
      type: 'created',
      config: {
        id,
        name,
        projectId,
        value: {enabled: false},
        version: 1,
        renderedOverrides: [],
      },
    });

    // Update config - should trigger 'updated' event
    currentValue = {enabled: true};
    currentVersion = 2;
    await mem!.notify({configId: id});
    await sleep(10);

    expect(eventsSpy).toHaveBeenCalledTimes(2);
    expect(eventsSpy).toHaveBeenCalledWith({
      type: 'updated',
      config: {
        id,
        name,
        projectId,
        value: {enabled: true},
        version: 2,
        renderedOverrides: [],
      },
    });

    // Delete config - should trigger 'deleted' event
    exists = false;
    await mem!.notify({configId: id});
    await sleep(10);

    expect(eventsSpy).toHaveBeenCalledTimes(3);
    expect(eventsSpy).toHaveBeenCalledWith({
      type: 'deleted',
      config: {
        id,
        name,
        projectId,
        value: {enabled: true},
        version: 2,
        renderedOverrides: [],
      },
    });

    await replica.stop();
  });

  it('does not publish events when subject is not provided', async () => {
    const id = 'cfg-no-subject';
    const projectId = 'proj-no-subject';
    const name = 'noSubjectConfig';

    const configs = {
      async getReplicaDump() {
        return [];
      },
      async getReplicaConfig(cfgId: string) {
        if (cfgId !== id) return null;
        return {name, projectId, value: 1, version: 1, overrides: []};
      },
    };

    let mem: EventBusClient<ConfigChangePayload> | null = null;

    const replica = new ConfigsReplica({
      pool: {} as any,
      configs: configs as any,
      logger,
      // No eventsSubject provided

      createEventBusClient: (onNotification: any) => {
        mem = new InMemoryEventBus<ConfigChangePayload>({
          logger: console,
        }).createClient(onNotification);
        return mem!;
      },
    });

    await replica.start();
    await sleep(10);

    // Should not throw even without subject
    await mem!.notify({configId: id});
    await sleep(10);

    expect(replica.getConfigValue<number>({projectId, name})).toBe(1);

    await replica.stop();
  });

  it('publishes created events during initial full refresh', async () => {
    const config1 = {id: 'cfg-1', name: 'config1', projectId: 'proj', version: 1, value: 'v1', overrides: []};
    const config2 = {id: 'cfg-2', name: 'config2', projectId: 'proj', version: 1, value: 'v2', overrides: []};

    const configs = {
      async getReplicaDump() {
        return [config1, config2];
      },
      async getReplicaConfig(cfgId: string) {
        return null;
      },
    };

    let mem: EventBusClient<ConfigChangePayload> | null = null;
    const eventsSubject = new Subject<ConfigReplicaEvent>();
    const eventsSpy = vi.fn();

    eventsSubject.subscribe({
      next: eventsSpy,
      error: vi.fn(),
      complete: vi.fn(),
    });

    const replica = new ConfigsReplica({
      pool: {} as any,
      configs: configs as any,
      logger,
      eventsSubject,

      createEventBusClient: (onNotification: any) => {
        mem = new InMemoryEventBus<ConfigChangePayload>({
          logger: console,
        }).createClient(onNotification);
        return mem!;
      },
    });

    await replica.start();
    await sleep(10);

    // Initial full refresh should trigger 2 'created' events
    expect(eventsSpy).toHaveBeenCalledTimes(2);
    expect(eventsSpy).toHaveBeenCalledWith({
      type: 'created',
      config: {
        id: config1.id,
        name: config1.name,
        projectId: config1.projectId,
        value: config1.value,
        version: config1.version,
        renderedOverrides: [],
      },
    });
    expect(eventsSpy).toHaveBeenCalledWith({
      type: 'created',
      config: {
        id: config2.id,
        name: config2.name,
        projectId: config2.projectId,
        value: config2.value,
        version: config2.version,
        renderedOverrides: [],
      },
    });

    await replica.stop();
  });
});
