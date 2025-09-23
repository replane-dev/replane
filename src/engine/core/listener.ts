export interface Listener<T = unknown> {
  /** Start listening (if applicable). */
  start(): Promise<void>;
  /** Stop listening (if applicable). */
  stop(): Promise<void>;
  /** Subscribe to a channel (no-op for pure publishers). */
  addChannel(channel: string): Promise<void>;
  /** Unsubscribe from a channel (no-op for pure publishers). */
  removeChannel(channel: string): Promise<void>;
  /** Send a NOTIFY on a channel with an optional string payload. */
  notify(channel: string, payload?: string): Promise<void>;
}
