/* eslint-disable react-hooks/rules-of-hooks */

import {Kysely, PostgresDialect} from 'kysely';
import {LRUCache} from 'lru-cache';
import {Pool} from 'pg';
import {ApiTokenStore} from './core/api-token-store';
import {extractApiTokenId} from './core/api-token-utils';
import {AuditMessageStore} from './core/audit-message-store';
import {ConfigStore} from './core/config-store';
import {ConfigUserStore} from './core/config-user-store';
import {ConfigVersionStore} from './core/config-version-store';
import {type Context, GLOBAL_CONTEXT} from './core/context';
import {type DateProvider, DefaultDateProvider} from './core/date-provider';
import type {DB} from './core/db';
import {ConflictError} from './core/errors';
import {createLogger, type Logger, type LogLevel} from './core/logger';
import {migrate} from './core/migrations';
import {PermissionService} from './core/permission-service';
import {getPgPool} from './core/pg-pool-cache';
import {createSha256TokenHashingService} from './core/token-hashing-service';
import type {UseCase, UseCaseTransaction} from './core/use-case';
import {createCreateApiKeyUseCase} from './core/use-cases/create-api-key-use-case';
import {createCreateConfigUseCase} from './core/use-cases/create-config-use-case';
import {createDeleteApiKeyUseCase} from './core/use-cases/delete-api-key-use-case';
import {createDeleteConfigUseCase} from './core/use-cases/delete-config-use-case';
import {createGetApiKeyListUseCase} from './core/use-cases/get-api-key-list-use-case';
import {createGetApiKeyUseCase} from './core/use-cases/get-api-key-use-case';
import {createGetAuditLogMessageUseCase} from './core/use-cases/get-audit-log-message-use-case';
import {createGetAuditLogUseCase} from './core/use-cases/get-audit-log-use-case';
import {createGetConfigListUseCase} from './core/use-cases/get-config-list-use-case';
import {createGetConfigUseCase} from './core/use-cases/get-config-use-case';
import {createGetConfigValueUseCase} from './core/use-cases/get-config-value-use-case';
import {createGetConfigVersionListUseCase} from './core/use-cases/get-config-version-list-use-case';
import {createGetConfigVersionUseCase} from './core/use-cases/get-config-version-use-case';
import {createGetHealthUseCase} from './core/use-cases/get-health-use-case';
import {createPatchConfigUseCase} from './core/use-cases/patch-config-use-case';
import {createRestoreConfigVersionUseCase} from './core/use-cases/restore-config-version-use-case';
import {UserStore} from './core/user-store';

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
  useCase: UseCase<TReq, TRes>,
  options: ToEngineUseCaseOptions,
): LibUseCase<TReq, TRes> {
  return async (ctx: Context, req: TReq) => {
    for (let attempt = 0; attempt <= options.onConflictRetriesCount; attempt++) {
      const dbTx = await db.startTransaction().setIsolationLevel('serializable').execute();
      const configs = new ConfigStore(dbTx);
      const users = new UserStore(dbTx);
      const configUsers = new ConfigUserStore(dbTx);
      const configVersions = new ConfigVersionStore(dbTx);
      const apiTokens = new ApiTokenStore(dbTx);
      const auditMessages = new AuditMessageStore(dbTx);
      const permissionService = new PermissionService(configUsers);

      const tx: UseCaseTransaction = {
        configs,
        users,
        configUsers,
        configVersions,
        permissionService,
        apiTokens,
        auditMessages,
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

export interface ApiKeyInfo {}

export async function createEngine(options: EngineOptions) {
  const logger = createLogger({level: options.logLevel});
  const {db, pool, freePool} = await prepareDb(GLOBAL_CONTEXT, logger, options);

  const dateProvider = options.dateProvider ?? new DefaultDateProvider();

  const tokenHasher = createSha256TokenHashingService();

  const useCases = {
    getHealth: createGetHealthUseCase(),
    getConfigList: createGetConfigListUseCase({}),
    getAuditLog: createGetAuditLogUseCase(),
    getAuditLogMessage: createGetAuditLogMessageUseCase(),
    createConfig: createCreateConfigUseCase({dateProvider}),
    patchConfig: createPatchConfigUseCase({dateProvider}),
    getConfig: createGetConfigUseCase({}),
    deleteConfig: createDeleteConfigUseCase(),
    getConfigVersionList: createGetConfigVersionListUseCase({}),
    getConfigVersion: createGetConfigVersionUseCase({}),
    getConfigValue: createGetConfigValueUseCase(),
    getApiKeyList: createGetApiKeyListUseCase(),
    getApiKey: createGetApiKeyUseCase(),
    deleteApiKey: createDeleteApiKeyUseCase(),
    restoreConfigVersion: createRestoreConfigVersionUseCase({dateProvider}),
    createApiKey: createCreateApiKeyUseCase({tokenHasher}),
  } satisfies UseCaseMap;

  const engineUseCases = {} as InferEngineUserCaseMap<typeof useCases>;

  const useCaseOptions: ToEngineUseCaseOptions = {
    onConflictRetriesCount: options.onConflictRetriesCount ?? 16,
  };

  for (const name of Object.keys(useCases) as Array<keyof typeof engineUseCases>) {
    engineUseCases[name] = toEngineUseCase(
      db,
      logger,
      (useCases as UseCaseMap)[name],
      useCaseOptions,
    );
    engineUseCases[name] = addUseCaseLogging(engineUseCases[name], name, logger);
  }

  const apiKeyCache = new LRUCache<string, ApiKeyInfo>({
    max: 500,
    ttl: 60_000, // 1 minute
  });

  async function verifyApiKey(token: string): Promise<ApiKeyInfo | null> {
    const cached = apiKeyCache.get(token);
    if (cached) return cached;

    const tokenId = extractApiTokenId(token);
    if (!tokenId) return null;

    const row = await db
      .selectFrom('api_tokens as t')
      .select(['t.id as id', 't.token_hash as token_hash'])
      .where('t.id', '=', tokenId)
      .executeTakeFirst();
    if (!row) return null;

    const valid = await tokenHasher.verify(row.token_hash, token);
    if (!valid) return null;

    const info: ApiKeyInfo = {};
    apiKeyCache.set(token, info);
    return info;
  }

  return {
    useCases: engineUseCases,
    verifyApiKey,
    testing: {
      pool,
      auditMessages: new AuditMessageStore(db),
      dropDb: (ctx: Context) => dropDb(ctx, {pool, dbSchema: options.dbSchema, logger}),
    },
    destroy: () => freePool(),
  };
}

async function dropDb(
  ctx: Context,
  {pool, dbSchema, logger}: {pool: Pool; dbSchema: string; logger: Logger},
) {
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

function addUseCaseLogging(
  useCase: LibUseCase<any, any>,
  useCaseName: string,
  logger: Logger,
): LibUseCase<any, any> {
  return async (ctx, request): Promise<any> => {
    try {
      logger.info(ctx, {msg: `Running use case: ${useCaseName}...`});
      return await useCase(ctx, request);
    } catch (error) {
      logger.error(ctx, {msg: `Use case ${useCaseName} failed`, error});
      throw error;
    }
  };
}

async function prepareDb(ctx: Context, logger: Logger, options: EngineOptions) {
  const [pool, freePool] = getPgPool(options.databaseUrl);

  const client = await pool.connect();
  try {
    if (options.dbSchema !== 'public') {
      await client.query(`CREATE SCHEMA IF NOT EXISTS ${options.dbSchema}`);
    }
    await client.query(`set search_path to ${options.dbSchema}`);
    await migrate(ctx, client, logger, options.dbSchema);
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
