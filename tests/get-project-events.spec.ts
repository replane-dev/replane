import type {EventBusClient} from '@/engine/core/event-bus';
import {normalizeEmail} from '@/engine/core/utils';
import {afterEach, assert, beforeEach, describe, expect, it} from 'vitest';
import {
  type ConfigReplicaEvent,
  ConfigsReplicaService,
} from '../src/engine/core/configs-replica-service';
import {GLOBAL_CONTEXT} from '../src/engine/core/context';
import {InMemoryEventBus} from '../src/engine/core/in-memory-event-bus';
import type {Logger} from '../src/engine/core/logger';
import {createLogger} from '../src/engine/core/logger';
import type {ConfigVariantChangePayload} from '../src/engine/core/stores/config-variant-store';
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
    // Create a test project (automatically creates Production and Development environments)
    const {projectId: pid} = await fixture.engine.useCases.createProject(GLOBAL_CONTEXT, {
      currentUserEmail: TEST_USER_EMAIL,
      workspaceId: fixture.workspaceId,
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

    // Create a config (creates 2 variants - Production and Development)
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

    // Get the event - note that configId in event is actually the variantId
    const result = await eventPromise;
    expect(result.done).toBe(false);
    // Since creating a config creates 2 variants (Production and Development),
    // we get 2 events. Check the first one.
    expect(result.value?.type).toBe('created');
    expect(result.value?.configName).toBe('feature-flag');
    expect(result.value?.configId).toEqual(expect.any(String));

    await iterator.return?.();
  });

  it('should emit updated event when a config variant is updated', async () => {
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

    // Wait for replica to process the create
    await new Promise(resolve => setTimeout(resolve, 100));

    // Get variant for patching
    const variants = await fixture.engine.testing.configVariants.getByConfigId(configId);
    const variant = variants[0];
    assert(variant, 'Variant should exist');

    const events = fixture.engine.useCases.getProjectEvents(GLOBAL_CONTEXT, {projectId});
    const iterator = events[Symbol.asyncIterator]();

    // Start consuming in parallel
    const eventPromise = iterator.next();

    // Give the subscription time to be established
    await new Promise(resolve => setTimeout(resolve, 50));

    // Update the config variant
    await fixture.engine.useCases.patchConfigVariant(GLOBAL_CONTEXT, {
      configVariantId: variant.id,
      value: {newValue: {enabled: false}},
      currentUserEmail: TEST_USER_EMAIL,
      prevVersion: 1,
    });

    // Get the update event
    const result = await eventPromise;
    expect(result.done).toBe(false);
    expect(result.value.type).toBe('updated');
    expect(result.value.configId).toBe(variant.id); // configId in event is actually variantId

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

    // Wait for replica to process the create
    await new Promise(resolve => setTimeout(resolve, 200));

    const events = fixture.engine.useCases.getProjectEvents(GLOBAL_CONTEXT, {projectId});
    const iterator = events[Symbol.asyncIterator]();

    // Collect delete events with timeout
    const receivedEvents: any[] = [];
    const collectPromise = (async () => {
      const timeout = setTimeout(() => {}, 3000);
      try {
        for await (const event of events) {
          receivedEvents.push(event);
          if (event.type === 'deleted') {
            break;
          }
        }
      } finally {
        clearTimeout(timeout);
      }
    })();

    // Give the subscription time to be established
    await new Promise(resolve => setTimeout(resolve, 100));

    // Delete the config
    await fixture.engine.useCases.deleteConfig(GLOBAL_CONTEXT, {
      configId,
      currentUserEmail: TEST_USER_EMAIL,
      prevVersion: 1,
    });

    // Wait for events with a timeout
    await Promise.race([collectPromise, new Promise(resolve => setTimeout(resolve, 2000))]);

    // Find a delete event
    const deleteEvent = receivedEvents.find(e => e.type === 'deleted');
    expect(deleteEvent).toBeDefined();
    expect(deleteEvent?.configName).toBe('feature-flag');

    await iterator.return?.();
  }, 10000);

  it('should only emit events for the specified project', async () => {
    // Create another project (automatically creates Production and Development environments)
    const {projectId: otherProjectId} = await fixture.engine.useCases.createProject(
      GLOBAL_CONTEXT,
      {
        workspaceId: fixture.workspaceId,
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
      expect(result.value?.type).toBe('created');
      expect(result.value?.configName).toBe('target-flag');
      expect(result.value?.configId).toEqual(expect.any(String));

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
    expect(result1.value?.type).toBe('created');
    expect(result1.value?.configName).toBe('shared-flag');
    expect(result1.value?.configId).toEqual(expect.any(String));

    expect(result2.done).toBe(false);
    expect(result2.value?.type).toBe('created');
    expect(result2.value?.configName).toBe('shared-flag');
    expect(result2.value?.configId).toEqual(expect.any(String));

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
    const environmentId = 'env-1';
    const config1 = {variant_id: 'var-1', name: 'config1', projectId, environmentId, version: 1};
    const config2 = {variant_id: 'var-2', name: 'config2', projectId, environmentId, version: 1};

    let currentConfigs: any[] = [];

    const configs = {
      async getReplicaDump() {
        return currentConfigs;
      },
      async getReplicaConfig(variantId: string) {
        return currentConfigs.find(c => c.variant_id === variantId) || null;
      },
    } as any;

    let mem: EventBusClient<ConfigVariantChangePayload> | null = null;
    const eventsSubject = new Subject<ConfigReplicaEvent>();

    const replica = new ConfigsReplicaService({
      pool: {} as any,
      configs,
      logger,
      eventsSubject,
      createEventBusClient: (onNotification: any) => {
        mem = new InMemoryEventBus<ConfigVariantChangePayload>({
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
    currentConfigs = [{...config1, value: 'v1', overrides: []}];
    await mem!.notify({variantId: config1.variant_id});
    await sleep(10);

    // Add second config
    currentConfigs.push({...config2, value: 'v2', overrides: []});
    await mem!.notify({variantId: config2.variant_id});
    await sleep(10);

    // Update first config
    currentConfigs[0] = {...config1, value: 'v1-updated', version: 2, overrides: []};
    await mem!.notify({variantId: config1.variant_id});
    await sleep(10);

    await consumePromise;

    expect(receivedEvents).toEqual([
      {
        type: 'created',
        configName: 'config1',
        configId: 'var-1',
        renderedOverrides: [],
        version: 1,
        value: 'v1',
      },
      {
        type: 'created',
        configName: 'config2',
        configId: 'var-2',
        renderedOverrides: [],
        version: 1,
        value: 'v2',
      },
      {
        type: 'updated',
        configName: 'config1',
        configId: 'var-1',
        renderedOverrides: [],
        version: 2,
        value: 'v1-updated',
      },
    ] satisfies ProjectEvent[]);

    await replica.stop();
  });

  it('should filter events by project and only stream relevant ones', async () => {
    const project1 = 'proj-1';
    const project2 = 'proj-2';
    const environmentId = 'env-1';
    const config1 = {
      variant_id: 'var-1',
      name: 'config1',
      projectId: project1,
      environmentId,
      version: 1,
    };
    const config2 = {
      variant_id: 'var-2',
      name: 'config2',
      projectId: project2,
      environmentId,
      version: 1,
    };

    let currentConfigs: any[] = [];

    const configs = {
      async getReplicaDump() {
        return currentConfigs;
      },
      async getReplicaConfig(variantId: string) {
        return currentConfigs.find(c => c.variant_id === variantId) || null;
      },
    } as any;

    let mem: EventBusClient<ConfigVariantChangePayload> | null = null;
    const eventsSubject = new Subject<ConfigReplicaEvent>();

    const replica = new ConfigsReplicaService({
      pool: {} as any,
      configs,
      logger,
      eventsSubject,
      createEventBusClient: (onNotification: any) => {
        mem = new InMemoryEventBus<ConfigVariantChangePayload>({
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
    currentConfigs = [{...config2, value: 'v2', overrides: []}];
    await mem!.notify({variantId: config2.variant_id});
    await sleep(10);

    // Add config for project1 - should be received
    currentConfigs.push({...config1, value: 'v1', overrides: []});
    await mem!.notify({variantId: config1.variant_id});
    await sleep(10);

    await consumePromise;

    // Should only receive event for project1
    expect(receivedEvents).toEqual([
      {
        type: 'created',
        configName: 'config1',
        configId: 'var-1',
        renderedOverrides: [],
        version: 1,
        value: 'v1',
      },
    ] satisfies ProjectEvent[]);

    await replica.stop();
  });

  it('should stream delete events when configs are removed', async () => {
    const projectId = 'proj-1';
    const environmentId = 'env-1';
    const config1 = {
      variant_id: 'var-1',
      name: 'config1',
      projectId,
      environmentId,
      version: 1,
      value: 'v1',
      overrides: [],
    };

    let currentConfigs: any[] = [config1];

    const configs = {
      async getReplicaDump() {
        return currentConfigs;
      },
      async getReplicaConfig(variantId: string) {
        return currentConfigs.find(c => c.variant_id === variantId) || null;
      },
    } as any;

    let mem: EventBusClient<ConfigVariantChangePayload> | null = null;
    const eventsSubject = new Subject<ConfigReplicaEvent>();

    const replica = new ConfigsReplicaService({
      pool: {} as any,
      configs,
      logger,
      eventsSubject,
      createEventBusClient: (onNotification: any) => {
        mem = new InMemoryEventBus<ConfigVariantChangePayload>({
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
      configId: 'var-1',
      renderedOverrides: [],
      version: 1,
      value: 'v1',
    } satisfies ProjectEvent);

    // Now delete the config
    currentConfigs = [];
    await mem!.notify({variantId: config1.variant_id});
    await sleep(10);

    await consumePromise;

    expect(receivedEvents).toEqual([
      {
        type: 'created',
        configName: 'config1',
        configId: 'var-1',
        renderedOverrides: [],
        version: 1,
        value: 'v1',
      },
      {
        type: 'deleted',
        configName: 'config1',
        configId: 'var-1',
        renderedOverrides: [],
        version: 1,
        value: 'v1',
      },
    ] satisfies ProjectEvent[]);

    await replica.stop();
  });

  it('should handle multiple concurrent consumers for different projects', async () => {
    const project1 = 'proj-1';
    const project2 = 'proj-2';
    const environmentId = 'env-1';
    const config1 = {
      variant_id: 'var-1',
      name: 'config1',
      projectId: project1,
      environmentId,
      version: 1,
    };
    const config2 = {
      variant_id: 'var-2',
      name: 'config2',
      projectId: project2,
      environmentId,
      version: 1,
    };

    let currentConfigs: any[] = [];

    const configs = {
      async getReplicaDump() {
        return currentConfigs;
      },
      async getReplicaConfig(variantId: string) {
        return currentConfigs.find(c => c.variant_id === variantId) || null;
      },
    } as any;

    let mem: EventBusClient<ConfigVariantChangePayload> | null = null;
    const eventsSubject = new Subject<ConfigReplicaEvent>();

    const replica = new ConfigsReplicaService({
      pool: {} as any,
      configs,
      logger,
      eventsSubject,
      createEventBusClient: (onNotification: any) => {
        mem = new InMemoryEventBus<ConfigVariantChangePayload>({
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
    currentConfigs = [{...config1, value: 'v1', overrides: []}];
    await mem!.notify({variantId: config1.variant_id});
    await sleep(10);

    // Add config for project2
    currentConfigs.push({...config2, value: 'v2', overrides: []});
    await mem!.notify({variantId: config2.variant_id});
    await sleep(10);

    await Promise.all([consume1, consume2]);

    // Each consumer should only receive events for their project
    expect(events1).toEqual([
      {
        type: 'created',
        configName: 'config1',
        configId: 'var-1',
        renderedOverrides: [],
        version: 1,
        value: 'v1',
      },
    ] satisfies ProjectEvent[]);
    expect(events2).toEqual([
      {
        type: 'created',
        configName: 'config2',
        configId: 'var-2',
        renderedOverrides: [],
        version: 1,
        value: 'v2',
      },
    ] satisfies ProjectEvent[]);

    await replica.stop();
  });

  it('should receive events from full refresh on initial load', async () => {
    const projectId = 'proj-1';
    const environmentId = 'env-1';
    const config1 = {
      variant_id: 'var-1',
      name: 'config1',
      projectId,
      environmentId,
      version: 1,
      value: 'v1',
      overrides: [],
    };
    const config2 = {
      variant_id: 'var-2',
      name: 'config2',
      projectId,
      environmentId,
      version: 1,
      value: 'v2',
      overrides: [],
    };

    const currentConfigs: any[] = [config1, config2];

    const configs = {
      async getReplicaDump() {
        return currentConfigs;
      },
      async getReplicaConfig(variantId: string) {
        return currentConfigs.find(c => c.variant_id === variantId) || null;
      },
    } as any;

    let mem: EventBusClient<ConfigVariantChangePayload> | null = null;
    const eventsSubject = new Subject<ConfigReplicaEvent>();

    const replica = new ConfigsReplicaService({
      pool: {} as any,
      configs,
      logger,
      eventsSubject,
      createEventBusClient: (onNotification: any) => {
        mem = new InMemoryEventBus<ConfigVariantChangePayload>({
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
      {
        type: 'created',
        configName: 'config1',
        configId: 'var-1',
        renderedOverrides: [],
        version: 1,
        value: 'v1',
      },
      {
        type: 'created',
        configName: 'config2',
        configId: 'var-2',
        renderedOverrides: [],
        version: 1,
        value: 'v2',
      },
    ] satisfies ProjectEvent[]);

    await replica.stop();
  });

  it('should handle rapid config changes without dropping events', async () => {
    const projectId = 'proj-1';
    const environmentId = 'env-1';
    let currentConfigs: any[] = [];

    const configs = {
      async getReplicaDump() {
        return currentConfigs;
      },
      async getReplicaConfig(variantId: string) {
        return currentConfigs.find(c => c.variant_id === variantId) || null;
      },
    } as any;

    let mem: EventBusClient<ConfigVariantChangePayload> | null = null;
    const eventsSubject = new Subject<ConfigReplicaEvent>();

    const replica = new ConfigsReplicaService({
      pool: {} as any,
      configs,
      logger,
      eventsSubject,
      createEventBusClient: (onNotification: any) => {
        mem = new InMemoryEventBus<ConfigVariantChangePayload>({
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
        variant_id: `var-${i}`,
        name: `config${i}`,
        projectId,
        environmentId,
        version: 1,
        value: `v${i}`,
        overrides: [],
      });
      await mem!.notify({variantId: `var-${i}`});
    }

    await consumePromise;

    // Should receive all 10 events in order
    expect(receivedEvents.length).toBe(10);
    for (let i = 1; i <= 10; i++) {
      expect(receivedEvents[i - 1]).toEqual({
        type: 'created',
        configId: `var-${i}`,
        configName: `config${i}`,
        renderedOverrides: [],
        version: 1,
        value: `v${i}`,
      } satisfies ProjectEvent);
    }

    await replica.stop();
  });
});
