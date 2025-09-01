import {Kysely, PostgresDialect} from 'kysely';
import {Pool} from 'pg';
import {ConfigStore} from './core/config-store';
import {Context, GLOBAL_CONTEXT} from './core/context';
import {DateProvider, DefaultDateProvider} from './core/date-provider';
import {DB} from './core/db';
import {ConflictError} from './core/errors';
import {createLogger, Logger, LogLevel} from './core/logger';
import {migrate} from './core/migrations';
import {getPgPool} from './core/pg-pool-cache';
import {UseCase, UseCaseTransaction} from './core/use-case';
import {createCreateConfigUseCase} from './core/use-cases/create-config-use-case';
import {createGetConfigListUseCase} from './core/use-cases/get-config-list-use-case';
import {createGetConfigUseCase} from './core/use-cases/get-config-use-case';
import {createGetHealthUseCase} from './core/use-cases/get-health-use-case';
import {createUpdateConfigUseCase} from './core/use-cases/update-config-use-case';

export interface EngineOptions {
  logLevel: LogLevel;
  databaseUrl: string;
  dbSchema: string;
  dateProvider?: DateProvider;
  onConflictRetriesCount?: number;
}

interface ToEngineUseCaseOptions {
  onConflictRetriesCount: number;
}

export interface LibUseCase<TRequest, TResponse> {
  (ctx: Context, request: TRequest): Promise<TResponse>;
}

function toEngineUseCase<TReq, TRes>(
  db: Kysely<DB>,
  logger: Logger,
  dateProvider: DateProvider,
  useCase: UseCase<TReq, TRes>,
  options: ToEngineUseCaseOptions,
): LibUseCase<TReq, TRes> {
  return async (ctx: Context, req: TReq) => {
    for (let attempt = 0; attempt <= options.onConflictRetriesCount; attempt++) {
      const dbTx = await db.startTransaction().setIsolationLevel('serializable').execute();
      const tx: UseCaseTransaction = {
        configStore: new ConfigStore(dbTx),
      };
      try {
        const result = await useCase(ctx, tx, req);
        await dbTx.commit().execute();
        return result;
      } catch (error) {
        await dbTx.rollback().execute();

        if (error instanceof Error && 'code' in error && error.code === '40001') {
          // we got SerializationFailure (SQLSTATE 40001), retry

          if (attempt === options.onConflictRetriesCount) {
            throw new ConflictError(
              `Transaction failed after ${options.onConflictRetriesCount} attempts due to serialization failure.`,
              {cause: error},
            );
          } else {
            logger.warn(ctx, {
              msg: `Transaction failed due to serialization failure, retrying... (attempt ${attempt + 1})`,
              attempt,
              error,
            });
          }
        } else {
          throw error;
        }
      }
    }

    throw new Error('unreachable');
  };
}

type InferEngineUserCaseMap<T> = {
  [K in keyof T]: T[K] extends UseCase<infer Req, infer Res> ? LibUseCase<Req, Res> : never;
};

type UseCaseMap = Record<string, UseCase<any, any>>;

export async function createEngine(options: EngineOptions) {
  const logger = createLogger({level: options.logLevel});
  const {db, pool, freePool} = await prepareDb(GLOBAL_CONTEXT, logger, options);

  const dateProvider = options.dateProvider ?? new DefaultDateProvider();

  const useCases = {
    getHealth: createGetHealthUseCase(),
    getConfigList: createGetConfigListUseCase({}),
    createConfig: createCreateConfigUseCase({}),
    updateConfig: createUpdateConfigUseCase({}),
    getConfig: createGetConfigUseCase({}),
  } satisfies UseCaseMap;

  const engineUseCases = {} as InferEngineUserCaseMap<typeof useCases>;

  const useCaseOptions: ToEngineUseCaseOptions = {
    onConflictRetriesCount: options.onConflictRetriesCount ?? 16,
  };

  for (const name of Object.keys(useCases) as Array<keyof typeof engineUseCases>) {
    engineUseCases[name] = toEngineUseCase(db, logger, dateProvider, (useCases as UseCaseMap)[name], useCaseOptions);
    engineUseCases[name] = addUseCaseLogging(engineUseCases[name], name, logger);
  }

  return {
    useCases: engineUseCases,
    testing: {
      dropDb: (ctx: Context) => dropDb(ctx, {pool, dbSchema: options.dbSchema, logger}),
    },
    destroy: () => freePool(),
  };
}

async function dropDb(ctx: Context, {pool, dbSchema, logger}: {pool: Pool; dbSchema: string; logger: Logger}) {
  logger.info(ctx, {msg: `Dropping database schema ${dbSchema}...`});

  const connection = await pool.connect();
  try {
    await connection.query(`DROP SCHEMA IF EXISTS ${dbSchema} CASCADE`);
    logger.info(ctx, {msg: `Database schema ${dbSchema} dropped.`});
  } catch (error: unknown) {
    logger.error(ctx, {error, msg: `Error dropping database schema ${dbSchema}`});
    throw error;
  } finally {
    connection.release();
  }
}

function addUseCaseLogging(useCase: LibUseCase<any, any>, useCaseName: string, logger: Logger): LibUseCase<any, any> {
  return async (ctx, request): Promise<any> => {
    logger.info(ctx, {msg: `Running use case: ${useCaseName}...`});
    return await useCase(ctx, request);
  };
}

async function prepareDb(ctx: Context, logger: Logger, options: EngineOptions) {
  const [pool, freePool] = getPgPool(options.databaseUrl);

  const client = await pool.connect();
  try {
    if (options.dbSchema !== 'public') {
      await client.query(`CREATE SCHEMA ${options.dbSchema}`);
    }
    await client.query(`set search_path to ${options.dbSchema}`);
    await migrate(ctx, client, logger);
  } finally {
    client.release();
  }

  const dialect = new PostgresDialect({
    pool,
  });

  const db = new Kysely<DB>({dialect}).withSchema(options.dbSchema);

  return {db, pool, freePool};
}

export type Engine = Awaited<ReturnType<typeof createEngine>>;
