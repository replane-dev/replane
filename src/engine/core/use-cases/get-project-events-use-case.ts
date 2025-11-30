import {Channel} from 'async-channel';
import type {ConfigReplicaEvent} from '../configs-replica';
import type {Context} from '../context';
import type {Observable} from '../observable';

export interface GetProjectEventsRequest {
  projectId: string;
  abortSignal?: AbortSignal;
}

export interface ProjectEvent {
  type: 'created' | 'updated' | 'deleted';
  configId: string;
  configName: string;
}

export interface GetProjectEventsUseCaseDeps {
  configEventsObservable: Observable<ConfigReplicaEvent>;
}

// TODO: avoid unbounded queue growth in Channel if consumer is slow
export function createGetProjectEventsUseCase(
  deps: GetProjectEventsUseCaseDeps,
): (ctx: Context, request: GetProjectEventsRequest) => AsyncIterable<ProjectEvent> {
  return async function* (ctx, request) {
    // permissions must be checked by the caller

    const channel = new Channel<ProjectEvent>();

    const unsubscribe = deps.configEventsObservable.subscribe({
      next: (event: ConfigReplicaEvent) => {
        // Filter events by projectId
        if (event.variant.projectId === request.projectId) {
          channel.push({
            type: event.type,
            configId: event.variant.variantId,
            configName: event.variant.name,
          });
        }
      },
      error: (err: unknown) => {
        channel.throw(err);
      },
      complete: () => {
        cleanUp();
      },
    });

    let isCleanedUp = false;
    const cleanUp = () => {
      if (isCleanedUp) return;
      isCleanedUp = true;

      unsubscribe();
      channel.close();
      request.abortSignal?.removeEventListener('abort', cleanUp);
    };

    request.abortSignal?.addEventListener('abort', cleanUp);

    try {
      for await (const event of channel) {
        yield event;
      }
    } finally {
      cleanUp();
    }
  };
}
