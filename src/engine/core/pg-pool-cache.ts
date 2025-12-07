import assert from 'assert';
import {Pool} from 'pg';
import type {ConnectionOptions} from 'tls';

const poolCache = new Map<string, Pool>();
const poolCounter = new Map<string, number>();

export function getPgPool(databaseUrl: string) {
  if (!poolCache.has(databaseUrl)) {
    let ssl: ConnectionOptions | undefined;

    // Support custom SSL certificate via environment variable
    if (process.env.DATABASE_SSL_CA) {
      ssl = {
        ca: process.env.DATABASE_SSL_CA,
      };
    }

    poolCache.set(
      databaseUrl,
      new Pool({
        connectionString: databaseUrl,
        max: 50,
        idleTimeoutMillis: 30000,
        connectionTimeoutMillis: 2000,
        ssl,
      }),
    );
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
