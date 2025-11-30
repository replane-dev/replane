import type {EventBusClient} from '@/engine/core/event-bus';
import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest';
import {type ConfigReplicaEvent, ConfigsReplica} from '../src/engine/core/configs-replica';
import {InMemoryEventBus} from '../src/engine/core/in-memory-event-bus';
import type {Logger} from '../src/engine/core/logger';
import {createLogger} from '../src/engine/core/logger';
import type {ConfigVariantChangePayload} from '../src/engine/core/stores/config-variant-store';
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
    const variantId = 'var-1';
    const projectId = 'proj-1';
    const environmentId = 'env-1';
    const name = 'featureFlag';
    let currentValue: any = {on: false};

    const configs = {
      async getReplicaDump() {
        return [
          {
            variant_id: variantId,
            name,
            projectId,
            environmentId,
            value: currentValue,
            version: 1,
            overrides: [],
          },
        ];
      },
      async getReplicaConfig(vId: string) {
        if (vId !== variantId) return null;
        return {
          variant_id: variantId,
          name,
          projectId,
          environmentId,
          value: currentValue,
          version: 1,
          overrides: [],
        };
      },
    };

    // capture the in-memory listener to emit notifications
    let mem: EventBusClient<ConfigVariantChangePayload> | null = null;

    const replica = new ConfigsReplica({
      pool: {} as any,
      configs: configs as any,
      logger,
      createEventBusClient: (onNotification: any) => {
        mem = new InMemoryEventBus<ConfigVariantChangePayload>({
          logger: console,
        }).createClient(onNotification);
        return mem!;
      },
    });

    await replica.start();

    // initial full refresh happens on start
    // give worker a tick to process
    await sleep(10);
    expect(replica.getConfigValue<{on: boolean}>({projectId, name, environmentId})).toEqual({
      on: false,
    });
    // simulate an update notification
    currentValue = {on: true};

    await mem!.notify({variantId});
    await sleep(10);
    expect(replica.getConfigValue<{on: boolean}>({projectId, name, environmentId})).toEqual({
      on: true,
    });

    await replica.stop();
  });

  it('removes config on delete notification', async () => {
    const variantId = 'var-2';
    const projectId = 'proj-1';
    const environmentId = 'env-1';
    const name = 'toDelete';
    let exists = true;

    const configs = {
      async getReplicaDump() {
        return exists
          ? [
              {
                variant_id: variantId,
                name,
                projectId,
                environmentId,
                value: 1,
                version: 1,
                overrides: [],
              },
            ]
          : [];
      },
      async getReplicaConfig(vId: string) {
        if (vId !== variantId) return null;
        return exists
          ? {
              variant_id: variantId,
              name,
              projectId,
              environmentId,
              value: 1,
              version: 1,
              overrides: [],
            }
          : null;
      },
    };

    let mem: EventBusClient<ConfigVariantChangePayload> | null = null;

    const replica = new ConfigsReplica({
      pool: {} as any,
      configs: configs as any,
      logger,

      createEventBusClient: (onNotification: any) => {
        mem = new InMemoryEventBus<ConfigVariantChangePayload>({
          logger: console,
        }).createClient(onNotification);
        return mem!;
      },
    });

    await replica.start();
    await sleep(10);
    expect(replica.getConfigValue<number>({projectId, name, environmentId})).toBe(1);

    // now delete and notify
    exists = false;
    await mem!.notify({variantId});
    await sleep(10);
    expect(replica.getConfigValue<number>({projectId, name, environmentId})).toBeUndefined();

    await replica.stop();
  });

  it('processes multiple queued notifications for different ids', async () => {
    const envId = 'env-1';
    const a = {variantId: 'var-a', name: 'A', projectId: 'p', environmentId: envId, version: 1};
    const b = {variantId: 'var-b', name: 'B', projectId: 'p', environmentId: envId, version: 1};
    let valueA: any = 10;
    let valueB: any = 20;

    const configs = {
      async getReplicaDump() {
        return [];
      },
      async getReplicaConfig(vId: string) {
        if (vId === a.variantId)
          return {
            variant_id: a.variantId,
            name: a.name,
            projectId: a.projectId,
            environmentId: a.environmentId,
            value: valueA,
            version: a.version,
            overrides: [],
          };
        if (vId === b.variantId)
          return {
            variant_id: b.variantId,
            name: b.name,
            projectId: b.projectId,
            environmentId: b.environmentId,
            value: valueB,
            version: b.version,
            overrides: [],
          };
        return null;
      },
    };

    let mem: EventBusClient<ConfigVariantChangePayload> | null = null;
    const replica = new ConfigsReplica({
      pool: {} as any,
      configs: configs as any,
      logger,

      createEventBusClient: (onNotification: any) => {
        mem = new InMemoryEventBus<ConfigVariantChangePayload>({
          logger: console,
        }).createClient(onNotification);
        return mem!;
      },
    });

    await replica.start();
    await sleep(10);
    expect(
      replica.getConfigValue<number>({
        projectId: a.projectId,
        name: a.name,
        environmentId: a.environmentId,
      }),
    ).toBeUndefined();
    expect(
      replica.getConfigValue<number>({
        projectId: b.projectId,
        name: b.name,
        environmentId: b.environmentId,
      }),
    ).toBeUndefined();

    await mem!.notify({variantId: a.variantId});
    await mem!.notify({variantId: b.variantId});
    await sleep(20);

    expect(
      replica.getConfigValue<number>({
        projectId: a.projectId,
        name: a.name,
        environmentId: a.environmentId,
      }),
    ).toBe(10);
    expect(
      replica.getConfigValue<number>({
        projectId: b.projectId,
        name: b.name,
        environmentId: b.environmentId,
      }),
    ).toBe(20);

    // update values and notify again
    valueA = 11;
    valueB = 22;
    await mem!.notify({variantId: b.variantId});
    await mem!.notify({variantId: a.variantId});
    await sleep(20);

    expect(
      replica.getConfigValue<number>({
        projectId: a.projectId,
        name: a.name,
        environmentId: a.environmentId,
      }),
    ).toBe(11);
    expect(
      replica.getConfigValue<number>({
        projectId: b.projectId,
        name: b.name,
        environmentId: b.environmentId,
      }),
    ).toBe(22);

    await replica.stop();
  });

  it('publishes events to subject on config changes', async () => {
    const variantId = 'var-events';
    const projectId = 'proj-events';
    const environmentId = 'env-events';
    const name = 'eventsConfig';
    let currentValue: any = {enabled: false};
    let currentVersion = 1;
    let exists = true;

    const configs = {
      async getReplicaDump() {
        return [];
      },
      async getReplicaConfig(vId: string) {
        if (vId !== variantId) return null;
        if (!exists) return null;
        return {
          variant_id: variantId,
          name,
          projectId,
          environmentId,
          value: currentValue,
          version: currentVersion,
          overrides: [],
        };
      },
    };

    let mem: EventBusClient<ConfigVariantChangePayload> | null = null;
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
        mem = new InMemoryEventBus<ConfigVariantChangePayload>({
          logger: console,
        }).createClient(onNotification);
        return mem!;
      },
    });

    await replica.start();
    await sleep(10);

    // Notify about new config - should trigger 'created' event
    await mem!.notify({variantId});
    await sleep(10);

    expect(eventsSpy).toHaveBeenCalledTimes(1);
    expect(eventsSpy).toHaveBeenCalledWith({
      type: 'created',
      variant: {
        variantId,
        name,
        projectId,
        environmentId,
        value: {enabled: false},
        version: 1,
        renderedOverrides: [],
      },
    });

    // Update config - should trigger 'updated' event
    currentValue = {enabled: true};
    currentVersion = 2;
    await mem!.notify({variantId});
    await sleep(10);

    expect(eventsSpy).toHaveBeenCalledTimes(2);
    expect(eventsSpy).toHaveBeenCalledWith({
      type: 'updated',
      variant: {
        variantId,
        name,
        projectId,
        environmentId,
        value: {enabled: true},
        version: 2,
        renderedOverrides: [],
      },
    });

    // Delete config - should trigger 'deleted' event
    exists = false;
    await mem!.notify({variantId});
    await sleep(10);

    expect(eventsSpy).toHaveBeenCalledTimes(3);
    expect(eventsSpy).toHaveBeenCalledWith({
      type: 'deleted',
      variant: {
        variantId,
        name,
        projectId,
        environmentId,
        value: {enabled: true},
        version: 2,
        renderedOverrides: [],
      },
    });

    await replica.stop();
  });

  it('does not publish events when subject is not provided', async () => {
    const variantId = 'var-no-subject';
    const projectId = 'proj-no-subject';
    const environmentId = 'env-no-subject';
    const name = 'noSubjectConfig';

    const configs = {
      async getReplicaDump() {
        return [];
      },
      async getReplicaConfig(vId: string) {
        if (vId !== variantId) return null;
        return {
          variant_id: variantId,
          name,
          projectId,
          environmentId,
          value: 1,
          version: 1,
          overrides: [],
        };
      },
    };

    let mem: EventBusClient<ConfigVariantChangePayload> | null = null;

    const replica = new ConfigsReplica({
      pool: {} as any,
      configs: configs as any,
      logger,
      // No eventsSubject provided

      createEventBusClient: (onNotification: any) => {
        mem = new InMemoryEventBus<ConfigVariantChangePayload>({
          logger: console,
        }).createClient(onNotification);
        return mem!;
      },
    });

    await replica.start();
    await sleep(10);

    // Should not throw even without subject
    await mem!.notify({variantId});
    await sleep(10);

    expect(replica.getConfigValue<number>({projectId, name, environmentId})).toBe(1);

    await replica.stop();
  });

  it('publishes created events during initial full refresh', async () => {
    const envId = 'env-1';
    const config1 = {
      variant_id: 'var-1',
      name: 'config1',
      projectId: 'proj',
      environmentId: envId,
      version: 1,
      value: 'v1',
      overrides: [],
    };
    const config2 = {
      variant_id: 'var-2',
      name: 'config2',
      projectId: 'proj',
      environmentId: envId,
      version: 1,
      value: 'v2',
      overrides: [],
    };

    const configs = {
      async getReplicaDump() {
        return [config1, config2];
      },
      async getReplicaConfig(vId: string) {
        return null;
      },
    };

    let mem: EventBusClient<ConfigVariantChangePayload> | null = null;
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
        mem = new InMemoryEventBus<ConfigVariantChangePayload>({
          logger: console,
        }).createClient(onNotification);
        return mem!;
      },
    });

    await replica.start();
    await sleep(10);

    // Initial full refresh should trigger 2 'created' events
    expect(eventsSpy).toHaveBeenCalledTimes(2);
    expect(eventsSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        type: 'created',
        variant: expect.objectContaining({
          variantId: config1.variant_id,
          name: config1.name,
          projectId: config1.projectId,
          environmentId: config1.environmentId,
          value: config1.value,
          version: config1.version,
          renderedOverrides: [],
        }),
      }),
    );
    expect(eventsSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        type: 'created',
        variant: expect.objectContaining({
          variantId: config2.variant_id,
          name: config2.name,
          projectId: config2.projectId,
          environmentId: config2.environmentId,
          value: config2.value,
          version: config2.version,
          renderedOverrides: [],
        }),
      }),
    );

    await replica.stop();
  });
});
