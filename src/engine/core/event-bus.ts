export interface EventBusClient<T> {
  /** Start listening (if applicable). */
  start(): Promise<void>;
  /** Stop listening (if applicable). */
  stop(): Promise<void>;
  /** Send a NOTIFY on a channel with a string payload. */
  notify(payload: T): Promise<void>;
}
