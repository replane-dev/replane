import type {EventBusClient} from './event-bus';
import type {Log} from './pg-event-bus-client';

interface InMemoryEventBusOptions {
  logger?: Log;
}

export class InMemoryEventBus<T> {
  private handlers: Array<(event: T) => void> = [];
  private readonly logger?: Log;

  constructor(opts: InMemoryEventBusOptions) {
    this.logger = opts.logger;
  }

  createClient(onNotification: (event: T) => void): EventBusClient<T> {
    let started = false;
    const handler: (event: T) => void = e => onNotification(e);

    return {
      start: async () => {
        if (started) {
          throw new Error('InMemoryEventBus client already started');
        }
        started = true;

        this.handlers.push(handler);
      },
      stop: async () => {
        if (!started) {
          throw new Error('InMemoryEventBus client not started');
        }
        started = false;
        this.handlers = this.handlers.filter(h => h !== handler);
      },
      notify: async (payload: T) => {
        for (const h of this.handlers) {
          try {
            h(JSON.parse(JSON.stringify(payload)));
          } catch (err: any) {
            this.logger?.error('[InMemoryEventBus] client handler error: ' + (err?.message || err));
          }
        }
      },
    };
  }
}
