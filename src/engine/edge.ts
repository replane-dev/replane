import BetterSqlite3 from 'better-sqlite3';
import fs from 'node:fs/promises';
import path from 'node:path';
import {GLOBAL_CONTEXT} from './core/context';
import {type DateProvider, DefaultDateProvider} from './core/date-provider';
import {EventHub} from './core/event-hub';
import {createSha256HashingService} from './core/hashing-service';
import {createLogger, type LogLevel} from './core/logger';
import {prepareDb} from './core/prepare-db';
import {ReplicaService} from './core/replica';
import {ReplicaEventBus} from './core/replica-event-bus';
import type {Service} from './core/service';
import {ReplicaStore} from './core/stores/replica-store';
import {createGetProjectEventsUseCase} from './core/use-cases/get-project-events-use-case';
import {createGetSdkConfigsUseCase} from './core/use-cases/get-sdk-configs-use-case';
import {createVerifySdkKeyUseCase} from './core/use-cases/verify-sdk-key-use-case';

export interface EdgeOptions {
  logLevel: LogLevel;
  databaseUrl: string;
  dbSchema: string;
  dateProvider?: DateProvider;
  onFatalError: (error: unknown) => void;
  replicaStorage:
    | {type: 'memory'}
    | {type: 'file'; path: string; cacheSizeKb?: number; unsynced?: boolean}; // 128MB=131072, 256MB=262144, 512MB=524288
}

export async function createEdge(options: EdgeOptions) {
  const logger = createLogger({level: options.logLevel});

  logger.info(GLOBAL_CONTEXT, {msg: 'Creating edge...'});

  const {db, freePool} = await prepareDb(GLOBAL_CONTEXT, logger, options);

  const dateProvider = options.dateProvider ?? new DefaultDateProvider();

  const hasher = createSha256HashingService();

  const replicaEventsBus = new ReplicaEventBus();

  const sqlite = await openSqlite(options.replicaStorage);

  const replicaService = new ReplicaService(
    db,
    ReplicaStore.create(sqlite),
    new EventHub(db, dateProvider),
    logger,
    error => {
      logger.error(GLOBAL_CONTEXT, {msg: 'Replica fatal error', error});
      options.onFatalError(error);
    },
    replicaEventsBus,
  );

  const services: Service[] = [replicaService];

  for (const service of services) {
    logger.info(GLOBAL_CONTEXT, {msg: `Starting service: ${service.name}...`});
    await service.start(GLOBAL_CONTEXT);
  }

  const stopServices = async () => {
    for (const service of services) {
      logger.info(GLOBAL_CONTEXT, {msg: `Stopping service: ${service.name}...`});
      await service.stop(GLOBAL_CONTEXT);
    }
  };

  return {
    // SDK use cases use replica and shouldn't have PostgreSQL access for performance reasons
    useCases: {
      verifySdkKey: createVerifySdkKeyUseCase({
        replicaService: replicaService,
        hasher: hasher,
      }),
      getProjectEvents: createGetProjectEventsUseCase({
        replicaEventsBus: replicaEventsBus,
        replicaService: replicaService,
      }),
      getSdkConfigs: createGetSdkConfigsUseCase({configsReplica: replicaService}),
    },
    testing: {
      replicaService,
    },
    stopServices,
    stop: async () => {
      await stopServices();
      freePool();
    },
  };
}

async function tryUnlink(path: string) {
  if (await fs.stat(path).catch(() => false)) {
    await fs.unlink(path);
  }
}

async function openSqlite(options: EdgeOptions['replicaStorage']): Promise<BetterSqlite3.Database> {
  if (options.type === 'memory') {
    return new BetterSqlite3(':memory:');
  }
  try {
    await fs.mkdir(path.dirname(options.path), {recursive: true});
    const sqlite = new BetterSqlite3(options.path);
    sqlite.pragma('journal_mode = WAL');
    if (!options.unsynced) {
      sqlite.pragma('synchronous = NORMAL'); // NORMAL loses durability on power loss, FULL doesn't
    } else {
      sqlite.pragma('synchronous = FULL');
    }

    if (options.cacheSizeKb) {
      sqlite.pragma(`cache_size = -${options.cacheSizeKb}`);
    }

    return sqlite;
  } catch (error) {
    if (error instanceof Error && 'code' in error && typeof error.code === 'string') {
      if (error.code === 'SQLITE_CORRUPT') {
        // we don't care about corrupted database, we'll recreate it

        // unlink db file, wal and journal files
        await tryUnlink(options.path);
        await tryUnlink(options.path + '-wal');
        await tryUnlink(options.path + '-shm');
        await tryUnlink(options.path + '-journal');

        return openSqlite(options);
      }
    }

    const message = error instanceof Error ? error.message : String(error);
    throw new Error(`Unable to open SQLite database at ${options.path}: ${message}`, {
      cause: error,
    });
  }
}

export type Edge = Awaited<ReturnType<typeof createEdge>>;
