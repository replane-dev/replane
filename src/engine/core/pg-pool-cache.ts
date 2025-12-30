import assert from 'assert';
import {Pool} from 'pg';
import type {ConnectionOptions} from 'tls';

const poolCache = new Map<string, Pool>();
const poolCounter = new Map<string, number>();

export interface CreatePgPoolOptions {
  maxConnections?: number;
  queryTimeout?: number;
  idleTimeoutMillis?: number;
  connectionTimeoutMillis?: number;
}

export function createPgPool(databaseUrl: string, options: CreatePgPoolOptions = {}) {
  let ssl: ConnectionOptions | undefined;

  // Support custom SSL certificate via environment variable
  if (process.env.DATABASE_SSL_CA) {
    ssl = {
      ca: process.env.DATABASE_SSL_CA,
    };
  }

  let maxConnections = 10;
  if (process.env.DATABASE_MAX_CONNECTIONS) {
    maxConnections = parseInt(process.env.DATABASE_MAX_CONNECTIONS);
    if (Number.isNaN(maxConnections)) {
      throw new Error('DATABASE_MAX_CONNECTIONS must be a number');
    }
    if (maxConnections < 1) {
      throw new Error('DATABASE_MAX_CONNECTIONS must be greater than 0');
    }
  }

  const pool = new Pool({
    connectionString: databaseUrl,
    max: maxConnections,
    idleTimeoutMillis: options.idleTimeoutMillis ?? 30000,
    connectionTimeoutMillis: options.connectionTimeoutMillis ?? 2000,
    // NOTE:
    // Do NOT pass `statement_timeout` / `lock_timeout` / `idle_in_transaction_session_timeout`
    // as connection options. Some Postgres poolers (e.g. PgBouncer) reject these startup
    // parameters, causing boot/migrations to fail.
    query_timeout: options.queryTimeout ?? 60000, // 60 seconds (client-side timeout in node-postgres)
    ssl,
  });

  return pool;
}

export function getPgPool(databaseUrl: string) {
  if (!poolCache.has(databaseUrl)) {
    const pool = createPgPool(databaseUrl);
    poolCache.set(databaseUrl, pool);
  }

  poolCounter.set(databaseUrl, (poolCounter.get(databaseUrl) ?? 0) + 1);

  let freed = false;
  const free = () => {
    if (freed) return;
    freed = true;

    const count = poolCounter.get(databaseUrl);
    assert(count && count > 0, 'Pool counter should be positive');

    poolCounter.set(databaseUrl, count - 1);

    if (count > 1) return;

    const pool = poolCache.get(databaseUrl);
    assert(pool, 'Pool should exist');

    poolCache.delete(databaseUrl);
    poolCounter.delete(databaseUrl);
    pool.end();
  };

  return [poolCache.get(databaseUrl)!, free] as const;
}

export async function stopAllPools() {
  await Promise.all(Array.from(poolCache.values()).map(pool => pool.end()));
  poolCache.clear();
  poolCounter.clear();
}
