import type {EventBusClient} from '@/engine/core/event-bus';
import {normalizeEmail} from '@/engine/core/utils';
import {afterEach, beforeEach, describe, expect, it} from 'vitest';
import type {ConfigChangePayload} from '../src/engine/core/config-store';
import {type ConfigReplicaEvent, ConfigsReplica} from '../src/engine/core/configs-replica';
import {GLOBAL_CONTEXT} from '../src/engine/core/context';
import {InMemoryEventBus} from '../src/engine/core/in-memory-event-bus';
import type {Logger} from '../src/engine/core/logger';
import {createLogger} from '../src/engine/core/logger';
import {Subject} from '../src/engine/core/subject';
import {
  createGetProjectEventsUseCase,
  type ProjectEvent,
} from '../src/engine/core/use-cases/get-project-events-use-case';
import {useAppFixture} from './fixtures/trpc-fixture';

const TEST_USER_EMAIL = normalizeEmail('test-user@example.com');

describe('getProjectEvents Integration', () => {
  const fixture = useAppFixture({authEmail: TEST_USER_EMAIL});

  let projectId: string;

  beforeEach(async () => {
    // Create a test project
    const {projectId: pid} = await fixture.engine.useCases.createProject(GLOBAL_CONTEXT, {
      currentUserEmail: TEST_USER_EMAIL,
      name: 'test-project',
      description: 'Test project',
    });
    projectId = pid;
  });

  afterEach(async () => {
    await fixture.engine.useCases.deleteProject(GLOBAL_CONTEXT, {
      id: projectId,
      confirmName: 'test-project',
      currentUserEmail: TEST_USER_EMAIL,
    });
  });

  it('should emit created event when a config is created', async () => {
    const events = fixture.engine.useCases.getProjectEvents(GLOBAL_CONTEXT, {projectId});
    const iterator = events[Symbol.asyncIterator]();

    // Start consuming in parallel
    const eventPromise = iterator.next();

    // Give the subscription time to be established
    await new Promise(resolve => setTimeout(resolve, 50));

    // Create a config
    const {configId} = await fixture.engine.useCases.createConfig(GLOBAL_CONTEXT, {
      overrides: [],
      projectId,
      name: 'feature-flag',
      value: {enabled: true},
      description: 'Test config',
      schema: {},
      editorEmails: [],
      maintainerEmails: [],
      currentUserEmail: TEST_USER_EMAIL,
    });

    // Get the event
    const result = await eventPromise;
    expect(result.done).toBe(false);
    expect(result.value).toEqual({
      type: 'created',
      configId,
      configName: 'feature-flag',
    } satisfies ProjectEvent);

    await iterator.return?.();
  });

  it('should emit updated event when a config is updated', async () => {
    // Create initial config
    const {configId} = await fixture.engine.useCases.createConfig(GLOBAL_CONTEXT, {
      overrides: [],
      projectId,
      name: 'feature-flag',
      value: {enabled: true},
      description: 'Test config',
      schema: {},
      editorEmails: [],
      maintainerEmails: [],
      currentUserEmail: TEST_USER_EMAIL,
    });

    const events = fixture.engine.useCases.getProjectEvents(GLOBAL_CONTEXT, {projectId});
    const iterator = events[Symbol.asyncIterator]();

    // Consume the initial "created" event
    const createdResult = await iterator.next();
    expect(createdResult.value).toEqual({
      type: 'created',
      configName: 'feature-flag',
      configId,
    } satisfies ProjectEvent);

    // Update the config
    await fixture.engine.useCases.patchConfig(GLOBAL_CONTEXT, {
      configId,
      value: {newValue: {enabled: false}},
      currentUserEmail: TEST_USER_EMAIL,
      prevVersion: 1,
    });

    // Get the update event
    const result = await iterator.next();
    expect(result.done).toBe(false);
    expect(result.value).toEqual({
      type: 'updated',
      configName: 'feature-flag',
      configId,
    } satisfies ProjectEvent);

    await iterator.return?.();
  });

  it('should emit deleted event when a config is deleted', async () => {
    // Create initial config
    const {configId} = await fixture.engine.useCases.createConfig(GLOBAL_CONTEXT, {
      overrides: [],
      projectId,
      name: 'feature-flag',
      value: {enabled: true},
      description: 'Test config',
      schema: {},
      editorEmails: [],
      maintainerEmails: [],
      currentUserEmail: TEST_USER_EMAIL,
    });

    const events = fixture.engine.useCases.getProjectEvents(GLOBAL_CONTEXT, {projectId});
    const iterator = events[Symbol.asyncIterator]();

    // Consume the initial "created" event
    const createdResult = await iterator.next();
    expect(createdResult.value).toEqual({
      type: 'created',
      configName: 'feature-flag',
      configId,
    } satisfies ProjectEvent);

    // Delete the config
    await fixture.engine.useCases.deleteConfig(GLOBAL_CONTEXT, {
      configId,
      currentUserEmail: TEST_USER_EMAIL,
      prevVersion: 1,
    });

    // Get the delete event
    const result = await iterator.next();
    expect(result.done).toBe(false);
    expect(result.value).toEqual({
      type: 'deleted',
      configName: 'feature-flag',
      configId,
    } satisfies ProjectEvent);

    await iterator.return?.();
  });

  it('should only emit events for the specified project', async () => {
    // Create another project
    const {projectId: otherProjectId} = await fixture.engine.useCases.createProject(
      GLOBAL_CONTEXT,
      {
        currentUserEmail: TEST_USER_EMAIL,
        name: 'other-project',
        description: 'Other project',
      },
    );

    try {
      const events = fixture.engine.useCases.getProjectEvents(GLOBAL_CONTEXT, {projectId});
      const iterator = events[Symbol.asyncIterator]();

      // Start consuming in parallel
      const eventPromise = iterator.next();

      // Give the subscription time to be established
      await new Promise(resolve => setTimeout(resolve, 50));

      // Create config in other project - should not emit
      await fixture.engine.useCases.createConfig(GLOBAL_CONTEXT, {
        overrides: [],
        projectId: otherProjectId,
        name: 'other-flag',
        value: {x: 1},
        description: 'Other config',
        schema: {},
        editorEmails: [],
        maintainerEmails: [],
        currentUserEmail: TEST_USER_EMAIL,
      });

      // Create config in target project - should emit
      const {configId} = await fixture.engine.useCases.createConfig(GLOBAL_CONTEXT, {
        overrides: [],
        projectId,
        name: 'target-flag',
        value: {y: 2},
        description: 'Target config',
        schema: {},
        editorEmails: [],
        maintainerEmails: [],
        currentUserEmail: TEST_USER_EMAIL,
      });

      // Should only get event for target project
      const result = await eventPromise;
      expect(result.done).toBe(false);
      expect(result.value).toEqual({
        type: 'created',
        configName: 'target-flag',
        configId,
      } satisfies ProjectEvent);

      await iterator.return?.();
    } finally {
      await fixture.engine.useCases.deleteProject(GLOBAL_CONTEXT, {
        id: otherProjectId,
        confirmName: 'other-project',
        currentUserEmail: TEST_USER_EMAIL,
      });
    }
  });

  it('should support multiple concurrent consumers', async () => {
    // Create two independent event streams
    const events1 = fixture.engine.useCases.getProjectEvents(GLOBAL_CONTEXT, {projectId});
    const events2 = fixture.engine.useCases.getProjectEvents(GLOBAL_CONTEXT, {projectId});

    const iterator1 = events1[Symbol.asyncIterator]();
    const iterator2 = events2[Symbol.asyncIterator]();

    // Start consuming in parallel BEFORE creating the config
    const eventPromise1 = iterator1.next();
    const eventPromise2 = iterator2.next();

    // Give the subscriptions time to be established
    await new Promise(resolve => setTimeout(resolve, 50));

    // Create a config
    const {configId} = await fixture.engine.useCases.createConfig(GLOBAL_CONTEXT, {
      overrides: [],
      projectId,
      name: 'shared-flag',
      value: {count: 42},
      description: 'Shared config',
      schema: {},
      editorEmails: [],
      maintainerEmails: [],
      currentUserEmail: TEST_USER_EMAIL,
    });

    // Both iterators should receive the event
    const [result1, result2] = await Promise.all([eventPromise1, eventPromise2]);

    expect(result1.done).toBe(false);
    expect(result1.value).toEqual({
      type: 'created',
      configName: 'shared-flag',
      configId,
    } satisfies ProjectEvent);

    expect(result2.done).toBe(false);
    expect(result2.value).toEqual({
      type: 'created',
      configName: 'shared-flag',
      configId,
    } satisfies ProjectEvent);

    await iterator1.return?.();
    await iterator2.return?.();
  });

  it('should handle rapid successive events', async () => {
    const events = fixture.engine.useCases.getProjectEvents(GLOBAL_CONTEXT, {projectId});
    const iterator = events[Symbol.asyncIterator]();

    // Start a promise to collect events in the background
    const eventsPromise = (async () => {
      const receivedEvents = [];
      for (let i = 0; i < 3; i++) {
        const result = await iterator.next();
        expect(result.done).toBe(false);
        receivedEvents.push(result.value);
      }
      return receivedEvents;
    })();

    // Give the subscription time to be established
    await new Promise(resolve => setTimeout(resolve, 50));

    // Create multiple configs rapidly
    await Promise.all([
      fixture.engine.useCases.createConfig(GLOBAL_CONTEXT, {
        overrides: [],
        projectId,
        name: 'flag-1',
        value: {n: 1},
        description: 'Config 1',
        schema: {},
        editorEmails: [],
        maintainerEmails: [],
        currentUserEmail: TEST_USER_EMAIL,
      }),
      fixture.engine.useCases.createConfig(GLOBAL_CONTEXT, {
        overrides: [],
        projectId,
        name: 'flag-2',
        value: {n: 2},
        description: 'Config 2',
        schema: {},
        editorEmails: [],
        maintainerEmails: [],
        currentUserEmail: TEST_USER_EMAIL,
      }),
      fixture.engine.useCases.createConfig(GLOBAL_CONTEXT, {
        overrides: [],
        projectId,
        name: 'flag-3',
        value: {n: 3},
        description: 'Config 3',
        schema: {},
        editorEmails: [],
        maintainerEmails: [],
        currentUserEmail: TEST_USER_EMAIL,
      }),
    ]);

    // Wait for all events to be collected
    const receivedEvents = await eventsPromise;

    // Verify we got all three create events (by configId)
    expect(receivedEvents.length).toBe(3);
    expect(receivedEvents.every(e => e.type === 'created')).toBe(true);

    await iterator.return?.();
  });
});

function sleep(ms: number) {
  return new Promise(r => setTimeout(r, ms));
}

describe('GetProjectEvents Integration', () => {
  let logger: Logger;

  beforeEach(() => {
    logger = createLogger({level: 'silent'});
  });

  afterEach(() => {
    // nothing
  });

  it('should stream events from ConfigsReplica for a specific project', async () => {
    const projectId = 'proj-1';
    const config1 = {id: 'cfg-1', name: 'config1', projectId, version: 1};
    const config2 = {id: 'cfg-2', name: 'config2', projectId, version: 1};

    let currentConfigs: any[] = [];

    const configs = {
      async getReplicaDump() {
        return currentConfigs;
      },
      async getReplicaConfig(cfgId: string) {
        return currentConfigs.find(c => c.id === cfgId) || null;
      },
    } as any;

    let mem: EventBusClient<ConfigChangePayload> | null = null;
    const eventsSubject = new Subject<ConfigReplicaEvent>();

    const replica = new ConfigsReplica({
      pool: {} as any,
      configs,
      logger,
      eventsSubject,
      createEventBusClient: (onNotification: any) => {
        mem = new InMemoryEventBus<ConfigChangePayload>({
          logger: console,
        }).createClient(onNotification);
        return mem!;
      },
    } as any);

    // Create use case with the same subject
    const useCase = createGetProjectEventsUseCase({
      configEventsObservable: eventsSubject,
    });

    await replica.start();
    await sleep(10);

    // Start consuming events
    const receivedEvents: any[] = [];
    const iterator = useCase(GLOBAL_CONTEXT, {projectId});
    const consumePromise = (async () => {
      for await (const event of iterator) {
        receivedEvents.push(event);
        if (receivedEvents.length >= 3) {
          break;
        }
      }
    })();

    await sleep(10);

    // Add first config
    currentConfigs = [{...config1, value: 'v1'}];
    await mem!.notify({configId: config1.id});
    await sleep(10);

    // Add second config
    currentConfigs.push({...config2, value: 'v2'});
    await mem!.notify({configId: config2.id});
    await sleep(10);

    // Update first config
    currentConfigs[0] = {...config1, value: 'v1-updated', version: 2};
    await mem!.notify({configId: config1.id});
    await sleep(10);

    await consumePromise;

    expect(receivedEvents).toEqual([
      {type: 'created', configName: 'config1', configId: 'cfg-1'},
      {type: 'created', configName: 'config2', configId: 'cfg-2'},
      {type: 'updated', configName: 'config1', configId: 'cfg-1'},
    ] satisfies ProjectEvent[]);

    await replica.stop();
  });

  it('should filter events by project and only stream relevant ones', async () => {
    const project1 = 'proj-1';
    const project2 = 'proj-2';
    const config1 = {id: 'cfg-1', name: 'config1', projectId: project1, version: 1};
    const config2 = {id: 'cfg-2', name: 'config2', projectId: project2, version: 1};

    let currentConfigs: any[] = [];

    const configs = {
      async getReplicaDump() {
        return currentConfigs;
      },
      async getReplicaConfig(cfgId: string) {
        return currentConfigs.find(c => c.id === cfgId) || null;
      },
    } as any;

    let mem: EventBusClient<ConfigChangePayload> | null = null;
    const eventsSubject = new Subject<ConfigReplicaEvent>();

    const replica = new ConfigsReplica({
      pool: {} as any,
      configs,
      logger,
      eventsSubject,
      createEventBusClient: (onNotification: any) => {
        mem = new InMemoryEventBus<ConfigChangePayload>({
          logger: console,
        }).createClient(onNotification);
        return mem!;
      },
    } as any);

    const useCase = createGetProjectEventsUseCase({
      configEventsObservable: eventsSubject,
    });

    await replica.start();
    await sleep(10);

    // Start consuming events for project1 only
    const receivedEvents: any[] = [];
    const iterator = useCase(GLOBAL_CONTEXT, {projectId: project1});
    const consumePromise = (async () => {
      for await (const event of iterator) {
        receivedEvents.push(event);
        if (receivedEvents.length >= 1) {
          break;
        }
      }
    })();

    await sleep(10);

    // Add config for project2 - should be filtered out
    currentConfigs = [{...config2, value: 'v2'}];
    await mem!.notify({configId: config2.id});
    await sleep(10);

    // Add config for project1 - should be received
    currentConfigs.push({...config1, value: 'v1'});
    await mem!.notify({configId: config1.id});
    await sleep(10);

    await consumePromise;

    // Should only receive event for project1
    expect(receivedEvents).toEqual([
      {type: 'created', configName: 'config1', configId: 'cfg-1'},
    ] satisfies ProjectEvent[]);

    await replica.stop();
  });

  it('should stream delete events when configs are removed', async () => {
    const projectId = 'proj-1';
    const config1 = {id: 'cfg-1', name: 'config1', projectId, version: 1, value: 'v1'};

    let currentConfigs: any[] = [config1];

    const configs = {
      async getReplicaDump() {
        return currentConfigs;
      },
      async getReplicaConfig(cfgId: string) {
        return currentConfigs.find(c => c.id === cfgId) || null;
      },
    } as any;

    let mem: EventBusClient<ConfigChangePayload> | null = null;
    const eventsSubject = new Subject<ConfigReplicaEvent>();

    const replica = new ConfigsReplica({
      pool: {} as any,
      configs,
      logger,
      eventsSubject,
      createEventBusClient: (onNotification: any) => {
        mem = new InMemoryEventBus<ConfigChangePayload>({
          logger: console,
        }).createClient(onNotification);
        return mem!;
      },
    } as any);

    const useCase = createGetProjectEventsUseCase({
      configEventsObservable: eventsSubject,
    });

    // Start consuming BEFORE replica starts to catch the initial created event
    const receivedEvents: any[] = [];
    const iterator = useCase(GLOBAL_CONTEXT, {projectId});
    const consumePromise = (async () => {
      for await (const event of iterator) {
        receivedEvents.push(event);
        if (receivedEvents.length >= 2) {
          break;
        }
      }
    })();

    await sleep(10);

    // Start replica - this will trigger initial refresh and create event
    await replica.start();
    await sleep(20);

    // Should have received the created event from initial load
    expect(receivedEvents.length).toBeGreaterThanOrEqual(1);
    expect(receivedEvents[0]).toEqual({
      type: 'created',
      configName: 'config1',
      configId: 'cfg-1',
    } satisfies ProjectEvent);

    // Now delete the config
    currentConfigs = [];
    await mem!.notify({configId: config1.id});
    await sleep(10);

    await consumePromise;

    expect(receivedEvents).toEqual([
      {type: 'created', configName: 'config1', configId: 'cfg-1'},
      {type: 'deleted', configName: 'config1', configId: 'cfg-1'},
    ] satisfies ProjectEvent[]);

    await replica.stop();
  });

  it('should handle multiple concurrent consumers for different projects', async () => {
    const project1 = 'proj-1';
    const project2 = 'proj-2';
    const config1 = {id: 'cfg-1', name: 'config1', projectId: project1, version: 1};
    const config2 = {id: 'cfg-2', name: 'config2', projectId: project2, version: 1};

    let currentConfigs: any[] = [];

    const configs = {
      async getReplicaDump() {
        return currentConfigs;
      },
      async getReplicaConfig(cfgId: string) {
        return currentConfigs.find(c => c.id === cfgId) || null;
      },
    } as any;

    let mem: EventBusClient<ConfigChangePayload> | null = null;
    const eventsSubject = new Subject<ConfigReplicaEvent>();

    const replica = new ConfigsReplica({
      pool: {} as any,
      configs,
      logger,
      eventsSubject,
      createEventBusClient: (onNotification: any) => {
        mem = new InMemoryEventBus<ConfigChangePayload>({
          logger: console,
        }).createClient(onNotification);
        return mem!;
      },
    } as any);

    const useCase = createGetProjectEventsUseCase({
      configEventsObservable: eventsSubject,
    });

    await replica.start();
    await sleep(10);

    // Start two consumers for different projects
    const events1: any[] = [];
    const events2: any[] = [];

    const iterator1 = useCase(GLOBAL_CONTEXT, {projectId: project1});
    const iterator2 = useCase(GLOBAL_CONTEXT, {projectId: project2});

    const consume1 = (async () => {
      for await (const event of iterator1) {
        events1.push(event);
        if (events1.length >= 1) break;
      }
    })();

    const consume2 = (async () => {
      for await (const event of iterator2) {
        events2.push(event);
        if (events2.length >= 1) break;
      }
    })();

    await sleep(10);

    // Add config for project1
    currentConfigs = [{...config1, value: 'v1'}];
    await mem!.notify({configId: config1.id});
    await sleep(10);

    // Add config for project2
    currentConfigs.push({...config2, value: 'v2'});
    await mem!.notify({configId: config2.id});
    await sleep(10);

    await Promise.all([consume1, consume2]);

    // Each consumer should only receive events for their project
    expect(events1).toEqual([
      {type: 'created', configName: 'config1', configId: 'cfg-1'},
    ] satisfies ProjectEvent[]);
    expect(events2).toEqual([
      {type: 'created', configName: 'config2', configId: 'cfg-2'},
    ] satisfies ProjectEvent[]);

    await replica.stop();
  });

  it('should receive events from full refresh on initial load', async () => {
    const projectId = 'proj-1';
    const config1 = {id: 'cfg-1', name: 'config1', projectId, version: 1, value: 'v1'};
    const config2 = {id: 'cfg-2', name: 'config2', projectId, version: 1, value: 'v2'};

    const currentConfigs: any[] = [config1, config2];

    const configs = {
      async getReplicaDump() {
        return currentConfigs;
      },
      async getReplicaConfig(cfgId: string) {
        return currentConfigs.find(c => c.id === cfgId) || null;
      },
    } as any;

    let mem: EventBusClient<ConfigChangePayload> | null = null;
    const eventsSubject = new Subject<ConfigReplicaEvent>();

    const replica = new ConfigsReplica({
      pool: {} as any,
      configs,
      logger,
      eventsSubject,
      createEventBusClient: (onNotification: any) => {
        mem = new InMemoryEventBus<ConfigChangePayload>({
          logger: console,
        }).createClient(onNotification);
        return mem!;
      },
    } as any);

    const useCase = createGetProjectEventsUseCase({
      configEventsObservable: eventsSubject,
    });

    // Start consuming before replica starts
    const receivedEvents: any[] = [];
    const iterator = useCase(GLOBAL_CONTEXT, {projectId});
    const consumePromise = (async () => {
      for await (const event of iterator) {
        receivedEvents.push(event);
        if (receivedEvents.length >= 2) {
          break;
        }
      }
    })();

    await sleep(10);

    // Start replica - should trigger full refresh and publish created events
    await replica.start();
    await sleep(20);

    await consumePromise;

    // Should receive created events for both configs from initial load
    expect(receivedEvents).toEqual([
      {type: 'created', configName: 'config1', configId: 'cfg-1'},
      {type: 'created', configName: 'config2', configId: 'cfg-2'},
    ] satisfies ProjectEvent[]);

    await replica.stop();
  });

  it('should handle rapid config changes without dropping events', async () => {
    const projectId = 'proj-1';
    let currentConfigs: any[] = [];

    const configs = {
      async getReplicaDump() {
        return currentConfigs;
      },
      async getReplicaConfig(cfgId: string) {
        return currentConfigs.find(c => c.id === cfgId) || null;
      },
    } as any;

    let mem: EventBusClient<ConfigChangePayload> | null = null;
    const eventsSubject = new Subject<ConfigReplicaEvent>();

    const replica = new ConfigsReplica({
      pool: {} as any,
      configs,
      logger,
      eventsSubject,
      createEventBusClient: (onNotification: any) => {
        mem = new InMemoryEventBus<ConfigChangePayload>({
          logger: console,
        }).createClient(onNotification);
        return mem!;
      },
    });

    const useCase = createGetProjectEventsUseCase({
      configEventsObservable: eventsSubject,
    });

    await replica.start();
    await sleep(10);

    const receivedEvents: any[] = [];
    const iterator = useCase(GLOBAL_CONTEXT, {projectId});
    const consumePromise = (async () => {
      for await (const event of iterator) {
        receivedEvents.push(event);
        if (receivedEvents.length >= 10) {
          break;
        }
      }
    })();

    await sleep(10);

    // Rapidly create multiple configs
    for (let i = 1; i <= 10; i++) {
      currentConfigs.push({
        id: `cfg-${i}`,
        name: `config${i}`,
        projectId,
        version: 1,
        value: `v${i}`,
      });
      await mem!.notify({configId: `cfg-${i}`});
    }

    await consumePromise;

    // Should receive all 10 events in order
    expect(receivedEvents.length).toBe(10);
    for (let i = 1; i <= 10; i++) {
      expect(receivedEvents[i - 1]).toEqual({
        type: 'created',
        configId: `cfg-${i}`,
        configName: `config${i}`,
      } satisfies ProjectEvent);
    }

    await replica.stop();
  });
});
