// PgEventBusClient.ts
import assert from 'assert';
import type {Pool, PoolClient} from 'pg';
import {GLOBAL_CONTEXT} from './context';
import type {EventBusClient} from './event-bus';
import type {Logger} from './logger';

export interface PgEventBusClientBackoffOptions {
  /** Initial delay before first retry (ms). Default 500. */
  initialDelayMs?: number;
  /** Max backoff delay (ms). Default 30_000. */
  maxDelayMs?: number;
  /** Exponential multiplier. Default 2. */
  multiplier?: number;
  /** Full-jitter factor [0..1]. Default 0.2 (±20%). */
  jitter?: number;
}

export interface PgEventBusClientHealthcheckOptions {
  /** Run a healthcheck every N ms on the *listener* connection. Default 30_000. */
  intervalMs?: number;
  /** Abort the healthcheck query after this many ms via SET LOCAL statement_timeout. Default 5_000. */
  timeoutMs?: number;
  /** Query to run for healthcheck. Default 'SELECT 1'. */
  query?: string;
}

export type PgEventBusClientNotificationHandler<T> = (event: T) => void;

export interface PgEventBusClientOptions<T = unknown> {
  pool: Pool;
  /** Which PG channel to use for messaging. */
  channel: string;
  /** Called for every NOTIFY. */
  onNotification: PgEventBusClientNotificationHandler<T>;
  /** Optional hooks and behavior. */
  onReconnect?: (info: {attempt: number; delayMs: number; cause?: unknown}) => void;
  onError?: (err: unknown) => void;
  healthcheck?: PgEventBusClientHealthcheckOptions;
  backoff?: PgEventBusClientBackoffOptions;
  logger?: Logger;
  /** Optional app name to set on the session for observability. */
  applicationName?: string;
}

/** Robust LISTEN/NOTIFY manager using a shared pg.Pool. */
export class PgEventBusClient<T = unknown> implements EventBusClient<T> {
  private readonly pool: Pool;
  private readonly onNotification: PgEventBusClientNotificationHandler<T>;
  private readonly onReconnect?: PgEventBusClientOptions<T>['onReconnect'];
  private readonly onError?: PgEventBusClientOptions<T>['onError'];
  private readonly log: Logger;
  private readonly appName?: string;

  private readonly hc: Required<PgEventBusClientHealthcheckOptions>;
  private readonly bo: Required<PgEventBusClientBackoffOptions>;

  private client: PoolClient | null = null;
  private channel: string;
  private started = false;
  private stopping = false;

  private healthTimer?: NodeJS.Timeout;
  private connectAttempt = 0;
  private connectPromise: Promise<void> | null = null;

  constructor(opts: PgEventBusClientOptions<T>) {
    this.pool = opts.pool;
    this.onNotification = opts.onNotification;
    this.onReconnect = opts.onReconnect;
    this.onError = opts.onError;
    this.log = opts.logger ?? console;
    this.appName = opts.applicationName;

    this.channel = opts.channel;

    const hc = opts.healthcheck ?? {};
    this.hc = {
      intervalMs: hc.intervalMs ?? 30_000,
      timeoutMs: hc.timeoutMs ?? 5_000,
      query: hc.query ?? 'SELECT 1',
    };

    const bo = opts.backoff ?? {};
    this.bo = {
      initialDelayMs: bo.initialDelayMs ?? 500,
      maxDelayMs: bo.maxDelayMs ?? 30_000,
      multiplier: bo.multiplier ?? 2,
      jitter: bo.jitter ?? 0.2,
    };
  }

  /** Start the listener (idempotent). Resolves once initial LISTEN is active. */
  async start(): Promise<void> {
    if (this.started) return;
    this.started = true;
    this.stopping = false;
    await this.ensureConnected('start');

    // periodic health check on the listener session
    this.healthTimer = setInterval(() => {
      void this.healthCheck().catch((err: unknown) => {
        this.log.warn(GLOBAL_CONTEXT, {
          msg: '[PgEventBusClient] healthcheck failed:',
          error: err,
        });
        this.onError?.(err);
        void this.restart('healthcheck-failed', err);
      });
    }, this.hc.intervalMs);
  }

  /** Stop listening and clean up (idempotent). */
  async stop(): Promise<void> {
    this.stopping = true;
    if (this.healthTimer) {
      clearInterval(this.healthTimer);
      this.healthTimer = undefined;
    }
    await this.teardownClient();
    this.client = null;
    this.connectPromise = null;
    this.started = false;
  }

  /** Optional helper to send NOTIFY via the shared pool. */
  async notify(payload: T): Promise<void> {
    // Use literal to avoid SQL injection; payload is a string literal, not an identifier.
    await this.pool.query(
      `NOTIFY ${quoteIdent(this.channel)}, ${quoteLiteral(JSON.stringify(payload))}`,
    );
  }

  /** Current status snapshot. */
  status(): 'idle' | 'connecting' | 'listening' | 'stopping' | 'stopped' {
    if (this.stopping) return 'stopping';
    if (!this.started) return 'idle';
    if (this.client) return 'listening';
    if (this.connectPromise) return 'connecting';
    return 'stopped';
  }

  /** Quick health indicator (true = connected and last HC didn’t trigger restart). */
  isHealthy(): boolean {
    return !!this.client && this.started && !this.stopping;
  }

  // ---------- Internal ----------

  private async ensureConnected(reason: string): Promise<void> {
    if (this.stopping) return;
    if (this.client) return;

    if (this.connectPromise) {
      return this.connectPromise; // de-dup concurrent callers
    }

    this.connectPromise = (async () => {
      let delay = 0;
      if (this.connectAttempt > 0) {
        delay = backoffDelay(this.connectAttempt, this.bo);
        this.onReconnect?.({attempt: this.connectAttempt, delayMs: delay});
        this.log.warn(GLOBAL_CONTEXT, {
          msg: `[PgEventBusClient] reconnecting (attempt #${this.connectAttempt}) in ${delay}ms; reason: ${reason}`,
        });
        await sleep(delay);
      }

      this.connectAttempt++;

      const client = await this.pool.connect();
      this.log.info(GLOBAL_CONTEXT, {
        msg: `[PgEventBusClient] connected to pool`,
      });
      try {
        // Session configuration (optional)
        if (this.appName) {
          await client.query(`SET application_name = ${quoteLiteral(this.appName)}`);
        }
        // Ensure we start with a clean slate
        await client.query('UNLISTEN *');

        // Attach handlers before LISTEN so we don't miss early NOTIFYs
        client.on('notification', this.handleNotification);
        client.on('error', this.handleClientError);
        client.on('end', this.handleClientEnd);

        // Subscribe to the current channel
        await client.query(`LISTEN ${quoteIdent(this.channel)}`);

        this.client = client;
        this.connectAttempt = 0; // reset backoff
        this.log.info(GLOBAL_CONTEXT, {
          msg: `[PgEventBusClient] listening on ${this.channel}`,
        });
      } catch (err: unknown) {
        // If anything failed, detach handlers and drop the session
        client.removeListener('notification', this.handleNotification);
        client.removeListener('error', this.handleClientError);
        client.removeListener('end', this.handleClientEnd);
        // Try not to return a LISTENing client to the pool
        try {
          await client.query('UNLISTEN *');
        } catch {
          /* ignore */
        }
        client.release(); // release/destroy per pool policy
        throw err;
      }
    })().finally(() => {
      this.connectPromise = null;
    });

    return this.connectPromise;
  }

  private handleNotification = async (msg: {
    channel: string;
    payload?: string | undefined;
    processId: number;
  }) => {
    assert(this.channel === msg.channel, 'Received notification on unexpected channel');

    if (msg.payload == null) {
      this.log.error(GLOBAL_CONTEXT, {
        msg: '[PgEventBusClient] received NOTIFY with null payload',
      });
      this.onError?.(new Error('Received NOTIFY with null payload'));
      return;
    }

    try {
      this.onNotification(JSON.parse(msg.payload) as T);
    } catch (err: unknown) {
      // Don’t kill the listener on user handler errors; just surface them.
      this.log.error(GLOBAL_CONTEXT, {
        msg: '[PgEventBusClient] onNotification handler error:',
        error: err,
      });
      this.onError?.(err);
    }
  };

  private handleClientError = (err: Error) => {
    // Most client errors are non-recoverable for that session; restart.
    this.log.warn(GLOBAL_CONTEXT, {
      msg: '[PgEventBusClient] client error:',
      error: err,
    });
    this.onError?.(err);
    void this.restart('client-error', err);
  };

  private handleClientEnd = () => {
    this.log.warn(GLOBAL_CONTEXT, {
      msg: '[PgEventBusClient] client ended',
    });
    void this.restart('client-ended');
  };

  private async restart(reason: string, cause?: unknown): Promise<void> {
    this.log.warn(GLOBAL_CONTEXT, {
      msg: `[PgEventBusClient] restarting (reason: ${reason})`,
      error: cause,
    });
    if (this.stopping) return;
    await this.teardownClient();
    await this.ensureConnected(reason);
  }

  private async teardownClient(): Promise<void> {
    const c = this.client;
    if (!c) return;

    // Best-effort: unlisten & remove handlers before releasing to pool.
    try {
      c.removeListener('notification', this.handleNotification);
      c.removeListener('error', this.handleClientError);
      c.removeListener('end', this.handleClientEnd);
      try {
        await c.query('UNLISTEN *');
      } catch {
        /* ignore */
      }
    } finally {
      c.release(); // return to pool (not LISTENing anymore)
      this.client = null;
    }
  }

  private async healthCheck(): Promise<void> {
    const c = this.client;
    if (!c) {
      // Not connected — kick the connect loop
      await this.ensureConnected('no-client');
      return;
    }

    // Run a lightweight healthcheck on the *listener* session.
    // Use a local statement_timeout so we never block indefinitely.
    const timeout = Math.max(1, Math.floor(this.hc.timeoutMs));
    try {
      await c.query('BEGIN');
      await c.query(`SET LOCAL statement_timeout = ${timeout}`);
      await c.query(this.hc.query);
      await c.query('COMMIT');
    } catch (err) {
      try {
        await c.query('ROLLBACK');
      } catch {
        /* ignore */
      }
      throw err;
    }
  }
}

// ---------- helpers ----------

function sleep(ms: number): Promise<void> {
  return new Promise(r => setTimeout(r, ms));
}

function backoffDelay(attempt: number, bo: Required<PgEventBusClientBackoffOptions>): number {
  const base = Math.min(bo.maxDelayMs, bo.initialDelayMs * Math.pow(bo.multiplier, attempt - 1));
  const jitterRange = base * bo.jitter;
  // full jitter within ±jitterRange
  return Math.floor(base - jitterRange + Math.random() * (2 * jitterRange));
}

/** Quote a SQL identifier ("channel" name). */
function quoteIdent(ident: string): string {
  // If it's a simple unquoted identifier, keep it bare for readability
  if (/^[a-z_][a-z0-9_$]*$/.test(ident)) return ident;
  return '"' + ident.replace(/"/g, '""') + '"';
}

/** Quote a SQL string literal safely. */
function quoteLiteral(val: string): string {
  return "'" + val.replace(/'/g, "''") + "'";
}
