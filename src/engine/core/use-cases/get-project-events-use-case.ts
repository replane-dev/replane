import {Channel} from 'async-channel';
import type {Context} from '../context';
import type {RenderedOverride} from '../override-condition-schemas';
import type {ReplicaEvent, ReplicaService} from '../replica';
import type {ReplicaEventBus} from '../replica-event-bus';
import type {ConfigReplica} from '../stores/replica-store';
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
  | {
      type: 'config_deleted';
      configName: string;
      version: number;
      value: unknown;
      overrides: RenderedOverride[];
    };

export interface GetProjectEventsUseCaseDeps {
  replicaEventsBus: ReplicaEventBus;
  replicaService: ReplicaService;
}

// TODO: avoid unbounded queue growth in Channel if consumer is slow
export function createGetProjectEventsUseCase(
  deps: GetProjectEventsUseCaseDeps,
): (ctx: Context, request: GetProjectEventsRequest) => AsyncIterable<ProjectEvent> {
  const renderConfig = async (config: ConfigReplica, environmentId: string) => {
    const variant = config.variants.find(variant => variant.environmentId === environmentId);
    const configValue = variant === undefined ? config.value : variant.value;

    const rawConfigOverrides = variant === undefined ? config.overrides : variant.overrides;

    return await deps.replicaService.renderConfig({
      environmentId: environmentId,
      name: config.name,
      version: config.version,
      projectId: config.projectId,
      value: configValue,
      overrides: rawConfigOverrides,
    });
  };

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
        const renderedConfig = await renderConfig(event.entity, request.environmentId);

        if (event.type === 'deleted') {
          yield {
            type: 'config_deleted',
            configName: event.entity.name,
            version: event.entity.version,
            value: renderedConfig.value,
            overrides: renderedConfig.overrides,
          };
        } else if (event.type === 'created') {
          yield {
            type: 'config_created',
            configName: event.entity.name,
            overrides: renderedConfig.overrides,
            version: event.entity.version,
            value: renderedConfig.value,
          };
        } else if (event.type === 'updated') {
          yield {
            type: 'config_updated',
            configName: event.entity.name,
            overrides: renderedConfig.overrides,
            version: event.entity.version,
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
