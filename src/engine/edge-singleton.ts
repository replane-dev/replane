import {Lazy} from '@/engine/core/lazy';
import {getDatabaseUrl} from '@/environment';
import * as Sentry from '@sentry/nextjs';
import {ENGINE_STOP_TIMEOUT_MS} from './core/constants';
import {GLOBAL_CONTEXT} from './core/context';
import {createLogger} from './core/logger';
import {stopAllPools} from './core/pg-pool-cache';
import {ensureDefined, wait} from './core/utils';
import {createEdge, type Edge} from './edge';

// Shared singleton for SDK/edge operations.
export const edgeLazy = new Lazy(async () => {
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

  const edge = await createEdge({
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
      Sentry.captureException(error);
      logger.error(GLOBAL_CONTEXT, {msg: 'Edge fatal error', error});
      await Promise.race([
        (async () => {
          await edge.stop();
          await stopAllPools();
        })(),
        wait(ENGINE_STOP_TIMEOUT_MS).then(() => {
          logger.error(GLOBAL_CONTEXT, {msg: 'Edge stop timeout after fatal error'});
          process.exit(1);
        }),
      ]);

      process.exit(1);
    },
  });

  return edge;
});

export async function getEdgeSingleton(): Promise<Edge> {
  return edgeLazy.get();
}
