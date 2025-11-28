/* eslint-disable react-hooks/rules-of-hooks */

import {Kysely, PostgresDialect} from 'kysely';
import {Pool} from 'pg';
import {ApiTokenService} from './core/api-token-service';
import {AuditLogStore} from './core/audit-log-store';
import {ConfigProposalStore} from './core/config-proposal-store';
import {ConfigService} from './core/config-service';
import {ConfigStore} from './core/config-store';
import {ConfigUserStore} from './core/config-user-store';
import {ConfigVariantProposalStore} from './core/config-variant-proposal-store';
import {type ConfigVariantChangePayload, ConfigVariantStore} from './core/config-variant-store';
import {ConfigVariantVersionStore} from './core/config-variant-version-store';
import {type ConfigReplicaEvent, ConfigsReplica} from './core/configs-replica';
import {type Context, GLOBAL_CONTEXT} from './core/context';
import {type DateProvider, DefaultDateProvider} from './core/date-provider';
import type {DB} from './core/db';
import {ConflictError} from './core/errors';
import type {EventBusClient} from './core/event-bus';
import {createLogger, type Logger, type LogLevel} from './core/logger';
import {migrate} from './core/migrations';
import {PermissionService} from './core/permission-service';
import {
  PgEventBusClient,
  type PgEventBusClientNotificationHandler,
} from './core/pg-event-bus-client';
import {getPgPool} from './core/pg-pool-cache';
import {ProjectEnvironmentStore} from './core/project-environment-store';
import {ProjectStore} from './core/project-store';
import {ProjectUserStore} from './core/project-user-store';
import {SdkKeyStore} from './core/sdk-key-store';
import type {Service} from './core/service';
import {Subject} from './core/subject';
import {createSha256TokenHashingService} from './core/token-hashing-service';
import type {TransactionalUseCase, UseCase, UseCaseTransaction} from './core/use-case';
import {createApproveConfigProposalUseCase} from './core/use-cases/approve-config-proposal-use-case';
import {createApproveConfigVariantProposalUseCase} from './core/use-cases/approve-config-variant-proposal-use-case';
import {createCreateApiKeyUseCase} from './core/use-cases/create-api-key-use-case';
import {createCreateConfigProposalUseCase} from './core/use-cases/create-config-proposal-use-case';
import {createCreateConfigUseCase} from './core/use-cases/create-config-use-case';
import {createCreateConfigVariantProposalUseCase} from './core/use-cases/create-config-variant-proposal-use-case';
import {createCreateEnvironmentUseCase} from './core/use-cases/create-environment-use-case';
import {createCreateProjectUseCase} from './core/use-cases/create-project-use-case';
import {createDeleteApiKeyUseCase} from './core/use-cases/delete-api-key-use-case';
import {createDeleteConfigUseCase} from './core/use-cases/delete-config-use-case';
import {createDeleteEnvironmentUseCase} from './core/use-cases/delete-environment-use-case';
import {createDeleteProjectUseCase} from './core/use-cases/delete-project-use-case';
import {createGetApiKeyListUseCase} from './core/use-cases/get-api-key-list-use-case';
import {createGetApiKeyUseCase} from './core/use-cases/get-api-key-use-case';
import {createGetAuditLogMessageUseCase} from './core/use-cases/get-audit-log-message-use-case';
import {createGetAuditLogUseCase} from './core/use-cases/get-audit-log-use-case';
import {createGetConfigForApiUseCase} from './core/use-cases/get-config-for-api-use-case';
import {createGetConfigListUseCase} from './core/use-cases/get-config-list-use-case';
import {createGetConfigProposalListUseCase} from './core/use-cases/get-config-proposal-list-use-case';
import {createGetConfigProposalUseCase} from './core/use-cases/get-config-proposal-use-case';
import {createGetConfigUseCase} from './core/use-cases/get-config-use-case';
import {createGetConfigValueUseCase} from './core/use-cases/get-config-value-use-case';
import {createGetConfigVariantVersionListUseCase} from './core/use-cases/get-config-variant-version-list-use-case';
import {createGetConfigVariantVersionUseCase} from './core/use-cases/get-config-variant-version-use-case';
import {createGetEnvironmentListUseCase} from './core/use-cases/get-environment-list-use-case';
import {createGetHealthUseCase} from './core/use-cases/get-health-use-case';
import {createGetProjectEventsUseCase} from './core/use-cases/get-project-events-use-case';
import {createGetProjectListUseCase} from './core/use-cases/get-project-list-use-case';
import {createGetProjectUseCase} from './core/use-cases/get-project-use-case';
import {createGetProjectUsersUseCase} from './core/use-cases/get-project-users-use-case';
import {createPatchConfigUseCase} from './core/use-cases/patch-config-use-case';
import {createPatchConfigVariantUseCase} from './core/use-cases/patch-config-variant-use-case';
import {createPatchProjectUseCase} from './core/use-cases/patch-project-use-case';
import {createRejectAllPendingConfigProposalsUseCase} from './core/use-cases/reject-all-pending-config-proposals-use-case';
import {createRejectAllPendingConfigVariantProposalsUseCase} from './core/use-cases/reject-all-pending-config-variant-proposals-use-case';
import {createRejectConfigProposalUseCase} from './core/use-cases/reject-config-proposal-use-case';
import {createRejectConfigVariantProposalUseCase} from './core/use-cases/reject-config-variant-proposal-use-case';
import {createRestoreConfigVariantVersionUseCase} from './core/use-cases/restore-config-variant-version-use-case';
import {createUpdateProjectUseCase} from './core/use-cases/update-project-use-case';
import {createUpdateProjectUsersUseCase} from './core/use-cases/update-project-users-use-case';
import {UserStore} from './core/user-store';

export interface EngineOptions {
  logLevel: LogLevel;
  databaseUrl: string;
  dbSchema: string;
  requireProposals: boolean;
  allowSelfApprovals: boolean;
  dateProvider?: DateProvider;
  onConflictRetriesCount?: number;
  createEventBusClient?: (
    onNotification: PgEventBusClientNotificationHandler<ConfigVariantChangePayload>,
  ) => EventBusClient<ConfigVariantChangePayload>;
}

interface ToUseCaseOptions {
  onConflictRetriesCount: number;
  listener: EventBusClient<ConfigVariantChangePayload>;
  dateProvider: DateProvider;
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
      const configs = new ConfigStore(dbTx);
      const configProposals = new ConfigProposalStore(dbTx);
      const users = new UserStore(dbTx);
      const configUsers = new ConfigUserStore(dbTx);
      const sdkKeys = new SdkKeyStore(dbTx);
      const auditLogs = new AuditLogStore(dbTx);
      const projectUsers = new ProjectUserStore(dbTx);
      const projects = new ProjectStore(dbTx);
      const projectEnvironments = new ProjectEnvironmentStore(dbTx);
      const configVariants = new ConfigVariantStore(
        dbTx,
        scheduleOptimisticEffect,
        options.listener,
      );
      const configVariantVersions = new ConfigVariantVersionStore(dbTx);
      const configVariantProposals = new ConfigVariantProposalStore(dbTx);
      const permissionService = new PermissionService(configUsers, projectUsers, configs);
      const configService = new ConfigService(
        configs,
        configProposals,
        configUsers,
        permissionService,
        auditLogs,
        options.dateProvider,
        projectEnvironments,
        configVariants,
        configVariantVersions,
        configVariantProposals,
      );

      const tx: UseCaseTransaction = {
        scheduleOptimisticEffect,
        configs,
        configProposals,
        configService,
        users,
        configUsers,
        permissionService,
        sdkKeys,
        auditLogs,
        projectUsers,
        projects,
        projectEnvironments,
        configVariants,
        configVariantVersions,
        configVariantProposals,
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
  environmentId: string;
}

export async function createEngine(options: EngineOptions) {
  const logger = createLogger({level: options.logLevel});
  const {db, pool, freePool} = await prepareDb(GLOBAL_CONTEXT, logger, options);

  const dateProvider = options.dateProvider ?? new DefaultDateProvider();

  const tokenHasher = createSha256TokenHashingService();

  const apiTokenService = new ApiTokenService(db, tokenHasher);

  const createEventBusClient = options.createEventBusClient
    ? (_name: string, onNotification: (event: ConfigVariantChangePayload) => void) =>
        options.createEventBusClient!(onNotification)
    : (name: string, onNotification: (event: ConfigVariantChangePayload) => void) =>
        new PgEventBusClient<ConfigVariantChangePayload>({
          pool,
          channel: 'replane_events',
          onNotification,
          logger,
          applicationName: 'replane-engine',
          onError: error => {
            logger.error(GLOBAL_CONTEXT, {msg: `${name} Listener error`, error});
          },
        });

  // Shared listener/publisher instance to publish config changes
  const eventBusClient = createEventBusClient('ConfigChanges', () => {});

  const configEventsSubject = new Subject<ConfigReplicaEvent>();

  const configsReplica = new ConfigsReplica({
    pool,
    configs: new ConfigStore(db),
    logger,
    eventsSubject: configEventsSubject,
    createEventBusClient: onNotification => createEventBusClient('ConfigReplica', onNotification),
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
    createConfigProposal: createCreateConfigProposalUseCase({dateProvider}),
    createConfigVariantProposal: createCreateConfigVariantProposalUseCase({dateProvider}),
    approveConfigProposal: createApproveConfigProposalUseCase({
      dateProvider,
      allowSelfApprovals: options.allowSelfApprovals,
    }),
    approveConfigVariantProposal: createApproveConfigVariantProposalUseCase({
      dateProvider,
      allowSelfApprovals: options.allowSelfApprovals,
    }),
    rejectConfigProposal: createRejectConfigProposalUseCase({dateProvider}),
    rejectConfigVariantProposal: createRejectConfigVariantProposalUseCase({dateProvider}),
    rejectAllPendingConfigProposals: createRejectAllPendingConfigProposalsUseCase({}),
    rejectAllPendingConfigVariantProposals: createRejectAllPendingConfigVariantProposalsUseCase({}),
    getConfigProposal: createGetConfigProposalUseCase({}),
    getConfigProposalList: createGetConfigProposalListUseCase(),
    patchConfig: createPatchConfigUseCase({
      dateProvider,
      requireProposals: options.requireProposals,
    }),
    patchConfigVariant: createPatchConfigVariantUseCase({
      dateProvider,
      requireProposals: options.requireProposals,
    }),
    getConfig: createGetConfigUseCase({}),
    deleteConfig: createDeleteConfigUseCase({requireProposals: options.requireProposals}),
    getConfigVariantVersionList: createGetConfigVariantVersionListUseCase(),
    getConfigVariantVersion: createGetConfigVariantVersionUseCase(),
    getApiKeyList: createGetApiKeyListUseCase(),
    getApiKey: createGetApiKeyUseCase(),
    deleteApiKey: createDeleteApiKeyUseCase(),
    getProjectList: createGetProjectListUseCase(),
    getProject: createGetProjectUseCase(),
    createProject: createCreateProjectUseCase(),
    deleteProject: createDeleteProjectUseCase({requireProposals: options.requireProposals}),
    updateProject: createUpdateProjectUseCase(),
    patchProject: createPatchProjectUseCase(),
    getProjectUsers: createGetProjectUsersUseCase(),
    updateProjectUsers: createUpdateProjectUsersUseCase(),
    restoreConfigVariantVersion: createRestoreConfigVariantVersionUseCase({dateProvider}),
    createApiKey: createCreateApiKeyUseCase({tokenHasher}),
    createEnvironment: createCreateEnvironmentUseCase({dateProvider}),
    deleteEnvironment: createDeleteEnvironmentUseCase({dateProvider}),
    getEnvironmentList: createGetEnvironmentListUseCase({}),
  } satisfies UseCaseMap;

  const engineUseCases = {} as InferEngineUserCaseMap<typeof transactionalUseCases>;

  const useCaseOptions: ToUseCaseOptions = {
    onConflictRetriesCount: options.onConflictRetriesCount ?? 16,
    listener: eventBusClient,
    dateProvider,
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
      getConfigForApi: createGetConfigForApiUseCase({configsReplica}),
      getHealth: createGetHealthUseCase(),
      getProjectEvents: createGetProjectEventsUseCase({
        configEventsObservable: configEventsSubject,
      }),
    },
    verifyApiKey: apiTokenService.verifyApiKey.bind(apiTokenService),
    testing: {
      pool,
      dbSchema: options.dbSchema,
      auditLogs: new AuditLogStore(db),
      projects: new ProjectStore(db),
      configProposals: new ConfigProposalStore(db),
      configVariantProposals: new ConfigVariantProposalStore(db),
      configVariants: new ConfigVariantStore(db, () => {}, eventBusClient),
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
