import assert from 'node:assert';
import {Pool} from 'pg';

const poolCache = new Map<string, Pool>();
const poolCounter = new Map<string, number>();

export function getPgPool(databaseUrl: string) {
  if (!poolCache.has(databaseUrl)) {
    poolCache.set(
      databaseUrl,
      new Pool({
        connectionString: databaseUrl,
        max: 50,
        idleTimeoutMillis: 30000,
        connectionTimeoutMillis: 2000,
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
