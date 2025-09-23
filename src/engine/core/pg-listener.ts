// PgListener.ts
import type {Pool, PoolClient} from 'pg';
import type {Listener} from './listener';

export type Log = Pick<Console, 'debug' | 'info' | 'warn' | 'error'>;

export interface BackoffOptions {
  /** Initial delay before first retry (ms). Default 500. */
  initialDelayMs?: number;
  /** Max backoff delay (ms). Default 30_000. */
  maxDelayMs?: number;
  /** Exponential multiplier. Default 2. */
  multiplier?: number;
  /** Full-jitter factor [0..1]. Default 0.2 (±20%). */
  jitter?: number;
}

export interface HealthcheckOptions {
  /** Run a healthcheck every N ms on the *listener* connection. Default 30_000. */
  intervalMs?: number;
  /** Abort the healthcheck query after this many ms via SET LOCAL statement_timeout. Default 5_000. */
  timeoutMs?: number;
  /** Query to run for healthcheck. Default 'SELECT 1'. */
  query?: string;
}

export type NotificationHandler<T> = (msg: {
  channel: string;
  payload: T;
  rawPayload: string | undefined;
  processId: number;
}) => void | Promise<void>;

export interface PgListenerOptions<T = unknown> {
  pool: Pool;
  /** One or more channels to LISTEN. You can add/remove later via methods too. */
  channels: string[] | Set<string>;
  /** Called for every NOTIFY. */
  onNotification: NotificationHandler<T>;
  /** If true, JSON.parse(payload). If function, use it to parse. Else pass through string. */
  parsePayload?: boolean | ((payload: string) => T);
  /** Optional hooks and behavior. */
  onReconnect?: (info: {attempt: number; delayMs: number; cause?: Error}) => void;
  onError?: (err: Error) => void;
  healthcheck?: HealthcheckOptions;
  backoff?: BackoffOptions;
  logger?: Log;
  /** Optional app name to set on the session for observability. */
  applicationName?: string;
}

/** Robust LISTEN/NOTIFY manager using a shared pg.Pool. */
export class PgListener<T = unknown> implements Listener<T> {
  private readonly pool: Pool;
  private readonly parsePayload: PgListenerOptions<T>['parsePayload'];
  private readonly onNotification: NotificationHandler<T>;
  private readonly onReconnect?: PgListenerOptions<T>['onReconnect'];
  private readonly onError?: PgListenerOptions<T>['onError'];
  private readonly log: Log;
  private readonly appName?: string;

  private readonly hc: Required<HealthcheckOptions>;
  private readonly bo: Required<BackoffOptions>;

  private client: PoolClient | null = null;
  private channels = new Set<string>();
  private started = false;
  private stopping = false;

  private healthTimer?: NodeJS.Timeout;
  private connectAttempt = 0;
  private connectPromise: Promise<void> | null = null;

  constructor(opts: PgListenerOptions<T>) {
    this.pool = opts.pool;
    this.parsePayload = opts.parsePayload;
    this.onNotification = opts.onNotification;
    this.onReconnect = opts.onReconnect;
    this.onError = opts.onError;
    this.log = opts.logger ?? console;
    this.appName = opts.applicationName;

    for (const c of opts.channels instanceof Set ? opts.channels : new Set(opts.channels)) {
      this.channels.add(c);
    }

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
      void this.healthCheck().catch(err => {
        this.log.warn('[PgListener] healthcheck failed:', err?.message);
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

  /** Add a channel and subscribe immediately if connected. */
  async addChannel(channel: string): Promise<void> {
    this.channels.add(channel);
    if (this.client) {
      await this.safeQuery(this.client, `LISTEN ${quoteIdent(channel)}`);
    }
  }

  /** Remove a channel and UNLISTEN it immediately if connected. */
  async removeChannel(channel: string): Promise<void> {
    this.channels.delete(channel);
    if (this.client) {
      await this.safeQuery(this.client, `UNLISTEN ${quoteIdent(channel)}`);
    }
  }

  /** Optional helper to send NOTIFY via the shared pool. */
  async notify(channel: string, payload?: string): Promise<void> {
    console.log('[dbg] notify', {channel, payload});
    if (payload == null) {
      await this.pool.query(`NOTIFY ${quoteIdent(channel)}`);
    } else {
      // Use literal to avoid SQL injection; payload is a string literal, not an identifier.
      await this.pool.query(`NOTIFY ${quoteIdent(channel)}, ${quoteLiteral(payload)}`);
    }
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
        this.log.warn(
          `[PgListener] reconnecting (attempt #${this.connectAttempt}) in ${delay}ms; reason: ${reason}`,
        );
        await sleep(delay);
      }

      this.connectAttempt++;

      const client = await this.pool.connect();
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

        // Subscribe to all current channels
        for (const ch of this.channels) {
          console.log('[dbg] LISTEN', quoteIdent(ch));
          await client.query(`LISTEN ${quoteIdent(ch)}`);
        }

        this.client = client;
        this.connectAttempt = 0; // reset backoff
        this.log.info(
          '[PgListener] listening on',
          [...this.channels].map(c => `"${c}"`).join(', '),
        );
      } catch (err) {
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
    console.log('[dbg] notification', msg);
    try {
      const raw = msg.payload;
      let parsed: any = raw;

      if (raw != null) {
        if (this.parsePayload === true) {
          parsed = JSON.parse(raw);
        } else if (typeof this.parsePayload === 'function') {
          parsed = this.parsePayload(raw);
        }
      }

      await this.onNotification({
        channel: msg.channel,
        rawPayload: raw,
        payload: parsed as T,
        processId: msg.processId,
      });
    } catch (err: any) {
      // Don’t kill the listener on user handler errors; just surface them.
      this.log.error(
        '[PgListener] onNotification handler error:',
        err?.stack || err?.message || err,
      );
      this.onError?.(err);
    }
  };

  private handleClientError = (err: Error) => {
    // Most client errors are non-recoverable for that session; restart.
    this.log.warn('[PgListener] client error:', err.message);
    this.onError?.(err);
    void this.restart('client-error', err);
  };

  private handleClientEnd = () => {
    this.log.warn('[PgListener] client ended');
    void this.restart('client-ended');
  };

  private async restart(reason: string, cause?: Error): Promise<void> {
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

  private async safeQuery(client: PoolClient, sql: string): Promise<void> {
    try {
      await client.query(sql);
    } catch (err) {
      this.log.warn('[PgListener] query failed:', sql, (err as Error).message);
      throw err;
    }
  }
}

// ---------- helpers ----------

function sleep(ms: number): Promise<void> {
  return new Promise(r => setTimeout(r, ms));
}

function backoffDelay(attempt: number, bo: Required<BackoffOptions>): number {
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
