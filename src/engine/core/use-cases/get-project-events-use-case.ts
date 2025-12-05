import {Channel} from 'async-channel';
import type {Context} from '../context';
import type {RenderedOverride} from '../override-condition-schemas';
import type {ReplicaEvent, ReplicaService} from '../replica';
import type {ReplicaEventBus} from '../replica-event-bus';
import {assertNever} from '../utils';

export interface GetProjectEventsRequest {
  projectId: string;
  environmentId: string;
  abortSignal?: AbortSignal;
}

export type ProjectEvent =
  | {
      type: 'config_created';
      configName: string;
      overrides: RenderedOverride[];
      version: number;
      value: unknown;
    }
  | {
      type: 'config_updated';
      configName: string;
      overrides: RenderedOverride[];
      version: number;
      value: unknown;
    }
  | {type: 'config_deleted'; configName: string; version: number};

export interface GetProjectEventsUseCaseDeps {
  replicaEventsBus: ReplicaEventBus;
  replicaService: ReplicaService;
}

// TODO: avoid unbounded queue growth in Channel if consumer is slow
export function createGetProjectEventsUseCase(
  deps: GetProjectEventsUseCaseDeps,
): (ctx: Context, request: GetProjectEventsRequest) => AsyncIterable<ProjectEvent> {
  return async function* (ctx, request) {
    // permissions must be checked by the caller

    const channel = new Channel<ReplicaEvent>();

    const unsubscribe = deps.replicaEventsBus.subscribe(request.projectId, {
      next: (event: ReplicaEvent) => {
        channel.push(event);
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
        if (event.type === 'config_deleted') {
          yield {
            type: 'config_deleted',
            configName: event.config.name,
            version: event.config.version,
          };
          continue;
        }

        const renderedConfig = await deps.replicaService.getConfig({
          projectId: request.projectId,
          configName: event.config.name,
          environmentId: request.environmentId,
        });

        if (!renderedConfig) {
          continue;
        }

        if (event.type === 'config_created') {
          yield {
            type: 'config_created',
            configName: event.config.name,
            overrides: renderedConfig.overrides,
            version: event.config.version,
            value: renderedConfig.value,
          };
        } else if (event.type === 'config_updated') {
          yield {
            type: 'config_updated',
            configName: event.config.name,
            overrides: renderedConfig.overrides,
            version: event.config.version,
            value: renderedConfig.value,
          };
        } else {
          assertNever(event, 'Unknown replica event');
        }
      }
    } finally {
      cleanUp();
    }
  };
}
