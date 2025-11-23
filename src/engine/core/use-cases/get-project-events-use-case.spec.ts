import {describe, expect, it} from 'vitest';
import type {ConfigReplicaEvent} from '../configs-replica';
import {GLOBAL_CONTEXT} from '../context';
import {Subject} from '../subject';
import {createGetProjectEventsUseCase, type ProjectEvent} from './get-project-events-use-case';

function sleep(ms: number) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

describe('GetProjectEventsUseCase', () => {
  it('should yield events for the specified project', async () => {
    const subject = new Subject<ConfigReplicaEvent>();
    const useCase = createGetProjectEventsUseCase({
      configEventsObservable: subject,
    });

    const projectId = 'proj-1';
    const iterator = useCase(GLOBAL_CONTEXT, {projectId});

    // Start consuming events
    const receivedEvents: any[] = [];
    const consumePromise = (async () => {
      for await (const event of iterator) {
        receivedEvents.push(event);
        if (receivedEvents.length >= 2) {
          break; // Stop after receiving 2 events
        }
      }
    })();

    // Give the iterator time to start
    await sleep(10);

    // Publish events
    subject.next({
      type: 'created',
      config: {
        id: 'cfg-1',
        name: 'config1',
        projectId: 'proj-1',
        value: 'v1',
        version: 1,
        renderedOverrides: [],
      },
    });

    subject.next({
      type: 'updated',
      config: {
        id: 'cfg-1',
        name: 'config1',
        projectId: 'proj-1',
        value: 'v2',
        version: 2,
        renderedOverrides: [],
      },
    });

    await consumePromise;

    expect(receivedEvents).toEqual([
      {type: 'created', configName: 'config1', configId: 'cfg-1'},
      {type: 'updated', configName: 'config1', configId: 'cfg-1'},
    ] satisfies ProjectEvent[]);
  });

  it('should filter out events from other projects', async () => {
    const subject = new Subject<ConfigReplicaEvent>();
    const useCase = createGetProjectEventsUseCase({
      configEventsObservable: subject,
    });

    const projectId = 'proj-1';
    const iterator = useCase(GLOBAL_CONTEXT, {projectId});

    const receivedEvents: any[] = [];
    const consumePromise = (async () => {
      for await (const event of iterator) {
        receivedEvents.push(event);
        if (receivedEvents.length >= 1) {
          break;
        }
      }
    })();

    await sleep(10);

    // Publish event for different project - should be filtered out
    subject.next({
      type: 'created',
      config: {
        id: 'cfg-other',
        name: 'config-other',
        projectId: 'proj-2',
        value: 'v1',
        version: 1,
        renderedOverrides: [],
      },
    });

    // Publish event for our project - should be received
    subject.next({
      type: 'created',
      config: {
        id: 'cfg-1',
        name: 'config1',
        projectId: 'proj-1',
        value: 'v1',
        version: 1,
        renderedOverrides: [],
      },
    });

    await consumePromise;

    expect(receivedEvents).toEqual([
      {type: 'created', configName: 'config1', configId: 'cfg-1'},
    ] satisfies ProjectEvent[]);
  });

  it('should yield all event types', async () => {
    const subject = new Subject<ConfigReplicaEvent>();
    const useCase = createGetProjectEventsUseCase({
      configEventsObservable: subject,
    });

    const projectId = 'proj-1';
    const iterator = useCase(GLOBAL_CONTEXT, {projectId});

    const receivedEvents: any[] = [];
    const consumePromise = (async () => {
      for await (const event of iterator) {
        receivedEvents.push(event);
        if (receivedEvents.length >= 3) {
          break;
        }
      }
    })();

    await sleep(10);

    subject.next({
      type: 'created',
      config: {
        id: 'cfg-1',
        name: 'config1',
        projectId: 'proj-1',
        value: 'v1',
        version: 1,
        renderedOverrides: [],
      },
    });

    subject.next({
      type: 'updated',
      config: {
        id: 'cfg-1',
        name: 'config1',
        projectId: 'proj-1',
        value: 'v2',
        version: 2,
        renderedOverrides: [],
      },
    });

    subject.next({
      type: 'deleted',
      config: {
        id: 'cfg-1',
        name: 'config1',
        projectId: 'proj-1',
        value: 'v2',
        version: 2,
        renderedOverrides: [],
      },
    });

    await consumePromise;

    expect(receivedEvents).toEqual([
      {type: 'created', configName: 'config1', configId: 'cfg-1'},
      {type: 'updated', configName: 'config1', configId: 'cfg-1'},
      {type: 'deleted', configName: 'config1', configId: 'cfg-1'},
    ] satisfies ProjectEvent[]);
  });

  it('should unsubscribe when iterator is disposed', async () => {
    const subject = new Subject<ConfigReplicaEvent>();
    const useCase = createGetProjectEventsUseCase({
      configEventsObservable: subject,
    });

    const projectId = 'proj-1';
    const iterator = useCase(GLOBAL_CONTEXT, {projectId});

    const receivedEvents: any[] = [];

    // Start consuming in background
    const consumePromise = (async () => {
      for await (const event of iterator) {
        receivedEvents.push(event);
        break; // Exit after first event
      }
    })();

    await sleep(10);

    // Publish first event - will be received
    subject.next({
      type: 'created',
      config: {
        id: 'cfg-1',
        name: 'config1',
        projectId: 'proj-1',
        value: 'v1',
        version: 1,
        renderedOverrides: [],
      },
    });

    await consumePromise;

    // At this point, the finally block should have executed and unsubscribed

    // Publish another event - should not be received
    subject.next({
      type: 'created',
      config: {
        id: 'cfg-2',
        name: 'config2',
        projectId: 'proj-1',
        value: 'v1',
        version: 1,
        renderedOverrides: [],
      },
    });

    await sleep(10);

    // Should only have received the first event
    expect(receivedEvents.length).toBe(1);
  });

  it('should handle multiple events in quick succession', async () => {
    const subject = new Subject<ConfigReplicaEvent>();
    const useCase = createGetProjectEventsUseCase({
      configEventsObservable: subject,
    });

    const projectId = 'proj-1';
    const iterator = useCase(GLOBAL_CONTEXT, {projectId});

    const receivedEvents: any[] = [];
    const consumePromise = (async () => {
      for await (const event of iterator) {
        receivedEvents.push(event);
        if (receivedEvents.length >= 5) {
          break;
        }
      }
    })();

    await sleep(10);

    // Publish multiple events quickly
    for (let i = 1; i <= 5; i++) {
      subject.next({
        type: 'created',
        config: {
          id: `cfg-${i}`,
          name: `config${i}`,
          projectId: 'proj-1',
          value: `v${i}`,
          version: 1,
          renderedOverrides: [],
        },
      });
    }

    await consumePromise;

    expect(receivedEvents).toEqual([
      {type: 'created', configName: 'config1', configId: 'cfg-1'},
      {type: 'created', configName: 'config2', configId: 'cfg-2'},
      {type: 'created', configName: 'config3', configId: 'cfg-3'},
      {type: 'created', configName: 'config4', configId: 'cfg-4'},
      {type: 'created', configName: 'config5', configId: 'cfg-5'},
    ] satisfies ProjectEvent[]);
  });

  it('should handle events queued before iteration starts', async () => {
    const subject = new Subject<ConfigReplicaEvent>();
    const useCase = createGetProjectEventsUseCase({
      configEventsObservable: subject,
    });

    const projectId = 'proj-1';
    const iterable = useCase(GLOBAL_CONTEXT, {projectId});
    const iterator = iterable[Symbol.asyncIterator]();

    // Start the async generator (this subscribes)
    const iteratorPromise = iterator.next();

    // Immediately publish an event before awaiting
    subject.next({
      type: 'created',
      config: {
        id: 'cfg-1',
        name: 'config1',
        projectId: 'proj-1',
        value: 'v1',
        version: 1,
        renderedOverrides: [],
      },
    });

    const result = await iteratorPromise;

    expect(result.value).toEqual({
      type: 'created',
      configName: 'config1',
      configId: 'cfg-1',
    } satisfies ProjectEvent);
    expect(result.done).toBe(false);

    // Cleanup
    await iterator.return?.();
  });

  it('should handle return() to cleanup resources', async () => {
    const subject = new Subject<ConfigReplicaEvent>();
    const useCase = createGetProjectEventsUseCase({
      configEventsObservable: subject,
    });

    const projectId = 'proj-1';
    const iterable = useCase(GLOBAL_CONTEXT, {projectId});
    const iterator = iterable[Symbol.asyncIterator]();

    // Start iteration (will wait for first event)
    const nextPromise = iterator.next();

    // Publish an event
    subject.next({
      type: 'created',
      config: {
        id: 'cfg-1',
        name: 'config1',
        projectId: 'proj-1',
        value: 'v1',
        version: 1,
        renderedOverrides: [],
      },
    });

    await nextPromise;

    // Explicitly call return to cleanup
    const returnResult = await iterator.return?.();

    expect(returnResult?.done).toBe(true);

    // Verify we can't get more events
    const nextResult = await iterator.next();
    expect(nextResult.done).toBe(true);
  });
});
