import {Lazy} from '@/engine/core/lazy';
import {ENGINE_STOP_TIMEOUT_MS} from './core/constants';
import {GLOBAL_CONTEXT} from './core/context';
import {createLogger} from './core/logger';
import {stopAllPools} from './core/pg-pool-cache';
import {ensureDefined, joinUndefined, wait} from './core/utils';
import {createEngine, type Engine} from './engine';

export const getDatabaseUrl = () =>
  ensureDefined(
    process.env.DATABASE_URL ??
      joinUndefined(
        'postgres://',
        process.env.DATABASE_USER,
        ':',
        process.env.DATABASE_PASSWORD,
        '@',
        process.env.DATABASE_HOST,
        ':',
        process.env.DATABASE_PORT,
        '/',
        process.env.DATABASE_NAME,
      ),
    'DATABASE_URL or DATABASE_USER, DATABASE_PASSWORD, DATABASE_HOST, DATABASE_PORT, DATABASE_NAME env vars must be defined',
  );

// Shared singleton so TRPC and Hono reuse the same engine instance per process.
export const engineLazy = new Lazy(async () => {
  const logger = createLogger({level: 'info'});

  const replicaStorageCacheSizeKbString = process.env.REPLICA_STORAGE_CACHE_SIZE_KB;
  const replicaStorageCacheSizeKb = replicaStorageCacheSizeKbString
    ? parseInt(replicaStorageCacheSizeKbString)
    : undefined;
  if (replicaStorageCacheSizeKb && Number.isNaN(replicaStorageCacheSizeKb)) {
    throw new Error('REPLICA_STORAGE_CACHE_SIZE_KB must be a number');
  }

  const fallbackReplicaStoragePath =
    process.env.NODE_ENV === 'development' ? './replica-data/replica.db' : undefined;
  const replicaStoragePath = ensureDefined(
    process.env.REPLICA_STORAGE_PATH ?? fallbackReplicaStoragePath,
    'REPLICA_STORAGE_PATH is not defined',
  );

  const engine = await createEngine({
    databaseUrl: getDatabaseUrl(),
    dbSchema: process.env.DB_SCHEMA || 'public',
    logLevel: 'info',
    replicaStorage: {
      type: 'file',
      path: replicaStoragePath,
      cacheSizeKb: replicaStorageCacheSizeKb,
      unsynced: process.env.REPLICA_STORAGE_UNSYNCED === 'true',
    },
    onFatalError: async error => {
      logger.error(GLOBAL_CONTEXT, {msg: 'Engine fatal error', error});
      await Promise.race([
        (async () => {
          await engine.stop();
          await stopAllPools();
        })(),
        wait(ENGINE_STOP_TIMEOUT_MS).then(() => {
          logger.error(GLOBAL_CONTEXT, {msg: 'Engine stop timeout after fatal error'});
          process.exit(1);
        }),
      ]);

      process.exit(1);
    },
  });

  return engine;
});

export async function getEngineSingleton(): Promise<Engine> {
  return engineLazy.get();
}
