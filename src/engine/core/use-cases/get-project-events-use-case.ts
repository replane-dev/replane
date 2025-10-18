import {Channel} from 'async-channel';
import type {ConfigReplicaEvent} from '../configs-replica';
import type {Context} from '../context';
import type {Observable} from '../observable';

export interface GetProjectEventsRequest {
  projectId: string;
}

export interface ProjectEvent {
  type: 'created' | 'updated' | 'deleted';
  configId: string;
}

export interface GetProjectEventsUseCaseDeps {
  configEventsObservable: Observable<ConfigReplicaEvent>;
}

export function createGetProjectEventsUseCase(
  deps: GetProjectEventsUseCaseDeps,
): (ctx: Context, request: GetProjectEventsRequest) => AsyncIterable<ProjectEvent> {
  return async function* (ctx, request) {
    const channel = new Channel<ProjectEvent>();

    const unsubscribe = deps.configEventsObservable.subscribe({
      next: (event: ConfigReplicaEvent) => {
        // Filter events by projectId
        if (event.config.projectId === request.projectId) {
          channel.push({
            type: event.type,
            configId: event.config.id,
          });
        }
      },
      error: (err: unknown) => {
        channel.throw(err);
      },
      complete: () => {
        channel.close();
      },
    });

    try {
      for await (const event of channel) {
        yield event;
      }
    } finally {
      // Cleanup: unsubscribe when the async iterator is disposed
      unsubscribe();
      channel.close();
    }
  };
}
