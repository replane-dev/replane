/* eslint-disable react-hooks/rules-of-hooks */

import {Kysely, PostgresDialect} from 'kysely';
import {Pool} from 'pg';
import {ApiTokenService} from './core/api-token-service';
import {ApiTokenStore} from './core/api-token-store';
import {AuditMessageStore} from './core/audit-message-store';
import {type ConfigChangePayload, ConfigStore} from './core/config-store';
import {ConfigUserStore} from './core/config-user-store';
import {ConfigVersionStore} from './core/config-version-store';
import {ConfigsReplica} from './core/configs-replica';
import {CONFIGS_CHANGES_CHANNEL} from './core/constants';
import {type Context, GLOBAL_CONTEXT} from './core/context';
import {type DateProvider, DefaultDateProvider} from './core/date-provider';
import type {DB} from './core/db';
import {ConflictError} from './core/errors';
import type {Listener} from './core/listener';
import {createLogger, type Logger, type LogLevel} from './core/logger';
import {migrate} from './core/migrations';
import {PermissionService} from './core/permission-service';
import {PgListener} from './core/pg-listener';
import {getPgPool} from './core/pg-pool-cache';
import {ProjectStore} from './core/project-store';
import {ProjectUserStore} from './core/project-user-store';
import type {Service} from './core/service';
import {createSha256TokenHashingService} from './core/token-hashing-service';
import type {TransactionalUseCase, UseCase, UseCaseTransaction} from './core/use-case';
import {createCreateApiKeyUseCase} from './core/use-cases/create-api-key-use-case';
import {createCreateConfigUseCase} from './core/use-cases/create-config-use-case';
import {createCreateProjectUseCase} from './core/use-cases/create-project-use-case';
import {createDeleteApiKeyUseCase} from './core/use-cases/delete-api-key-use-case';
import {createDeleteConfigUseCase} from './core/use-cases/delete-config-use-case';
import {createDeleteProjectUseCase} from './core/use-cases/delete-project-use-case';
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
import {createGetProjectListUseCase} from './core/use-cases/get-project-list-use-case';
import {createGetProjectUseCase} from './core/use-cases/get-project-use-case';
import {createGetProjectUsersUseCase} from './core/use-cases/get-project-users-use-case';
import {createPatchConfigUseCase} from './core/use-cases/patch-config-use-case';
import {createPatchProjectUseCase} from './core/use-cases/patch-project-use-case';
import {createRestoreConfigVersionUseCase} from './core/use-cases/restore-config-version-use-case';
import {createUpdateProjectUseCase} from './core/use-cases/update-project-use-case';
import {createUpdateProjectUsersUseCase} from './core/use-cases/update-project-users-use-case';
import {UserStore} from './core/user-store';

export interface EngineOptions {
  logLevel: LogLevel;
  databaseUrl: string;
  dbSchema: string;
  dateProvider?: DateProvider;
  onConflictRetriesCount?: number;
}

interface ToUseCaseOptions {
  onConflictRetriesCount: number;
  listener: Listener;
}

function toUseCase<TReq, TRes>(
  db: Kysely<DB>,
  logger: Logger,
  useCase: TransactionalUseCase<TReq, TRes>,
  options: ToUseCaseOptions,
): UseCase<TReq, TRes> {
  return async (ctx: Context, req: TReq) => {
    for (let attempt = 0; attempt <= options.onConflictRetriesCount; attempt++) {
      const optimisticEffects: Array<() => Promise<void>> = [];
      function scheduleOptimisticEffect(effect: () => Promise<void>) {
        optimisticEffects.push(effect);
      }

      const dbTx = await db.startTransaction().setIsolationLevel('serializable').execute();
      const configs = new ConfigStore(dbTx, scheduleOptimisticEffect, options.listener);
      const users = new UserStore(dbTx);
      const configUsers = new ConfigUserStore(dbTx);
      const configVersions = new ConfigVersionStore(dbTx);
      const apiTokens = new ApiTokenStore(dbTx);
      const auditMessages = new AuditMessageStore(dbTx);
      const projectUsers = new ProjectUserStore(dbTx);
      const projects = new ProjectStore(dbTx);
      const permissionService = new PermissionService(configUsers, projectUsers, configs);

      const tx: UseCaseTransaction = {
        scheduleOptimisticEffect,
        configs,
        users,
        configUsers,
        configVersions,
        permissionService,
        apiTokens,
        auditMessages,
        projectUsers,
        projects,
      };
      try {
        const result = await useCase(ctx, tx, req);
        await dbTx.commit().execute();

        void Promise.all(optimisticEffects.map(effect => effect()));

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
  [K in keyof T]: T[K] extends TransactionalUseCase<infer Req, infer Res>
    ? UseCase<Req, Res>
    : never;
};

type UseCaseMap = Record<string, TransactionalUseCase<any, any>>;

export interface ApiKeyInfo {
  projectId: string;
}

export async function createEngine(options: EngineOptions) {
  const logger = createLogger({level: options.logLevel});
  const {db, pool, freePool} = await prepareDb(GLOBAL_CONTEXT, logger, options);

  const dateProvider = options.dateProvider ?? new DefaultDateProvider();

  const tokenHasher = createSha256TokenHashingService();

  const apiTokenService = new ApiTokenService(db, tokenHasher);
  // Shared listener/publisher instance for config changes
  const pgListener = new PgListener({
    pool,
    channels: [CONFIGS_CHANGES_CHANNEL],
    parsePayload: true,
    onNotification: () => {},
    logger,
    applicationName: 'replane-engine',
  });

  const configsReplica = new ConfigsReplica({
    pool,
    configs: new ConfigStore(
      db,
      /* no transaction, so run immediately */ effect => effect(),
      pgListener,
    ),
    logger,
    createListener: onNotification =>
      new PgListener<ConfigChangePayload>({
        pool: pool!,
        channels: [CONFIGS_CHANGES_CHANNEL],
        parsePayload: true,
        onNotification,
        onError: error => {
          logger.error(GLOBAL_CONTEXT, {msg: 'ConfigsReplica listener error', error});
        },
      }),
  });

  const services: Service[] = [apiTokenService, configsReplica];

  for (const service of services) {
    logger.info(GLOBAL_CONTEXT, {msg: `Starting service: ${service.name}...`});
    await service.start(GLOBAL_CONTEXT);
  }

  const transactionalUseCases = {
    getConfigList: createGetConfigListUseCase({}),
    getAuditLog: createGetAuditLogUseCase(),
    getAuditLogMessage: createGetAuditLogMessageUseCase(),
    createConfig: createCreateConfigUseCase({dateProvider}),
    patchConfig: createPatchConfigUseCase({dateProvider}),
    getConfig: createGetConfigUseCase({}),
    deleteConfig: createDeleteConfigUseCase(),
    getConfigVersionList: createGetConfigVersionListUseCase({}),
    getConfigVersion: createGetConfigVersionUseCase({}),
    getApiKeyList: createGetApiKeyListUseCase(),
    getApiKey: createGetApiKeyUseCase(),
    deleteApiKey: createDeleteApiKeyUseCase(),
    getProjectList: createGetProjectListUseCase(),
    getProject: createGetProjectUseCase(),
    createProject: createCreateProjectUseCase(),
    deleteProject: createDeleteProjectUseCase(),
    updateProject: createUpdateProjectUseCase(),
    patchProject: createPatchProjectUseCase(),
    getProjectUsers: createGetProjectUsersUseCase(),
    updateProjectUsers: createUpdateProjectUsersUseCase(),
    restoreConfigVersion: createRestoreConfigVersionUseCase({dateProvider}),
    createApiKey: createCreateApiKeyUseCase({tokenHasher}),
  } satisfies UseCaseMap;

  const engineUseCases = {} as InferEngineUserCaseMap<typeof transactionalUseCases>;

  const useCaseOptions: ToUseCaseOptions = {
    onConflictRetriesCount: options.onConflictRetriesCount ?? 16,
    listener: pgListener,
  };

  for (const name of Object.keys(transactionalUseCases) as Array<keyof typeof engineUseCases>) {
    engineUseCases[name] = toUseCase(
      db,
      logger,
      (transactionalUseCases as UseCaseMap)[name],
      useCaseOptions,
    );
    engineUseCases[name] = addUseCaseLogging(engineUseCases[name], name, logger);
  }

  return {
    useCases: {
      ...engineUseCases,
      getConfigValue: createGetConfigValueUseCase({configsReplica}),
      getHealth: createGetHealthUseCase(),
    },
    verifyApiKey: apiTokenService.verifyApiKey.bind(apiTokenService),
    testing: {
      pool,
      dbSchema: options.dbSchema,
      auditMessages: new AuditMessageStore(db),
      projects: new ProjectStore(db),
      dropDb: (ctx: Context) => dropDb(ctx, {pool, dbSchema: options.dbSchema, logger}),
    },
    destroy: async () => {
      freePool();
      for (const service of services) {
        logger.info(GLOBAL_CONTEXT, {msg: `Stopping service: ${service.name}...`});
        await service.stop(GLOBAL_CONTEXT);
      }
    },
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
  useCase: UseCase<any, any>,
  useCaseName: string,
  logger: Logger,
): UseCase<any, any> {
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

  pool.on('connect', async client => {
    if (options.dbSchema !== 'public') {
      await client.query(
        `CREATE SCHEMA IF NOT EXISTS ${options.dbSchema}; SET search_path TO ${options.dbSchema}`,
      );
    }
  });

  const client = await pool.connect();
  try {
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
