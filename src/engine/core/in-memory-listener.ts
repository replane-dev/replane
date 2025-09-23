import type {Listener} from './listener';
import type {Log, NotificationHandler} from './pg-listener';

type Handler = (payload?: string) => void | Promise<void>;

interface InMemoryListenerOptions<T = unknown> {
  channels: string[];
  onNotification: NotificationHandler<T>;
  parsePayload?: boolean;
  logger?: Log;
  applicationName?: string;
}

export class InMemoryListener<T = unknown> implements Listener<unknown> {
  private handlers: Map<string, Set<Handler>> = new Map();
  private started = false;
  private readonly onNotification: NotificationHandler<T>;
  private readonly parsePayload: boolean;
  private readonly logger?: Log;

  constructor(opts: InMemoryListenerOptions<T>) {
    for (const c of opts.channels) this.handlers.set(c, new Set());
    this.onNotification = opts.onNotification;
    this.parsePayload = !!opts.parsePayload;
    this.logger = opts.logger;
  }

  async start(): Promise<void> {
    this.started = true;
    this.logger?.info('[InMemoryListener] started');
  }

  async stop(): Promise<void> {
    this.started = false;
    this.logger?.info('[InMemoryListener] stopped');
  }

  async addChannel(channel: string): Promise<void> {
    if (!this.handlers.has(channel)) this.handlers.set(channel, new Set());
  }

  async removeChannel(channel: string): Promise<void> {
    this.handlers.delete(channel);
  }

  /** Register a local handler for a channel (utility for additional consumers in tests). */
  on(channel: string, handler: Handler): void {
    if (!this.handlers.has(channel)) this.handlers.set(channel, new Set());
    this.handlers.get(channel)!.add(handler);
  }

  off(channel: string, handler: Handler): void {
    this.handlers.get(channel)?.delete(handler);
  }

  async notify(channel: string, payload?: string): Promise<void> {
    if (!this.started) return;
    const set = this.handlers.get(channel);
    // Deliver to local handlers
    if (set && set.size > 0) {
      for (const h of set) {
        await h(payload);
      }
    }
    // Deliver to the primary onNotification subscriber
    try {
      const parsed =
        this.parsePayload && payload != null
          ? (JSON.parse(payload) as T)
          : (payload as unknown as T);
      await this.onNotification({
        channel,
        payload: parsed as T,
        rawPayload: payload,
        processId: 0,
      });
    } catch (err: any) {
      this.logger?.error(
        '[InMemoryListener] onNotification handler error: ' + (err?.message || err),
      );
      throw err;
    }
  }
}
