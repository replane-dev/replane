/* eslint-disable react-hooks/rules-of-hooks */

import BetterSqlite3 from 'better-sqlite3';
import {Kysely, PostgresDialect} from 'kysely';
import fs from 'node:fs/promises';
import path from 'node:path';
import {Pool} from 'pg';
import {ApiTokenService} from './core/api-token-service';
import {ConfigService} from './core/config-service';
import {type Context, GLOBAL_CONTEXT} from './core/context';
import {type DateProvider, DefaultDateProvider} from './core/date-provider';
import type {DB} from './core/db';
import {EventHub, EventHubPublisher} from './core/event-hub';
import {createLogger, type Logger, type LogLevel} from './core/logger';
import {migrate} from './core/migrations';
import {PermissionService} from './core/permission-service';
import {getPgPool} from './core/pg-pool-cache';
import {ReplicaService} from './core/replica';
import {ReplicaEventBus} from './core/replica-event-bus';
import type {Service} from './core/service';
import {AuditLogStore} from './core/stores/audit-log-store';
import {ConfigProposalStore} from './core/stores/config-proposal-store';
import {ConfigStore} from './core/stores/config-store';
import {ConfigUserStore} from './core/stores/config-user-store';
import {ConfigVariantStore} from './core/stores/config-variant-store';
import {ConfigVariantVersionStore} from './core/stores/config-variant-version-store';
import {ProjectEnvironmentStore} from './core/stores/project-environment-store';
import {ProjectStore} from './core/stores/project-store';
import {ProjectUserStore} from './core/stores/project-user-store';
import {ReplicaStore} from './core/stores/replica-store';
import {SdkKeyStore} from './core/stores/sdk-key-store';
import {WorkspaceMemberStore} from './core/stores/workspace-member-store';
import {WorkspaceStore} from './core/stores/workspace-store';
import {createSha256TokenHashingService} from './core/token-hashing-service';
import type {TransactionalUseCase, UseCase, UseCaseTransaction} from './core/use-case';
import {createAddWorkspaceMemberUseCase} from './core/use-cases/add-workspace-member-use-case';
import {createApproveConfigProposalUseCase} from './core/use-cases/approve-config-proposal-use-case';
import {createCreateApiKeyUseCase} from './core/use-cases/create-api-key-use-case';
import {createCreateConfigProposalUseCase} from './core/use-cases/create-config-proposal-use-case';
import {createCreateConfigUseCase} from './core/use-cases/create-config-use-case';
import {createCreateProjectEnvironmentUseCase} from './core/use-cases/create-project-environment-use-case';
import {createCreateProjectUseCase} from './core/use-cases/create-project-use-case';
import {createCreateWorkspaceUseCase} from './core/use-cases/create-workspace-use-case';
import {createDeleteApiKeyUseCase} from './core/use-cases/delete-api-key-use-case';
import {createDeleteConfigUseCase} from './core/use-cases/delete-config-use-case';
import {createDeleteProjectEnvironmentUseCase} from './core/use-cases/delete-project-environment-use-case';
import {createDeleteProjectUseCase} from './core/use-cases/delete-project-use-case';
import {createDeleteWorkspaceUseCase} from './core/use-cases/delete-workspace-use-case';
import {createGetApiKeyListUseCase} from './core/use-cases/get-api-key-list-use-case';
import {createGetApiKeyUseCase} from './core/use-cases/get-api-key-use-case';
import {createGetAuditLogMessageUseCase} from './core/use-cases/get-audit-log-message-use-case';
import {createGetAuditLogUseCase} from './core/use-cases/get-audit-log-use-case';
import {createGetConfigListUseCase} from './core/use-cases/get-config-list-use-case';
import {createGetConfigProposalListUseCase} from './core/use-cases/get-config-proposal-list-use-case';
import {createGetConfigProposalUseCase} from './core/use-cases/get-config-proposal-use-case';
import {createGetConfigUseCase} from './core/use-cases/get-config-use-case';
import {createGetConfigValueUseCase} from './core/use-cases/get-config-value-use-case';
import {createGetConfigVariantVersionListUseCase} from './core/use-cases/get-config-variant-version-list-use-case';
import {createGetConfigVariantVersionUseCase} from './core/use-cases/get-config-variant-version-use-case';
import {createGetHealthUseCase} from './core/use-cases/get-health-use-case';
import {createGetProjectEnvironmentsUseCase} from './core/use-cases/get-project-environments-use-case';
import {createGetProjectEventsUseCase} from './core/use-cases/get-project-events-use-case';
import {createGetProjectListUseCase} from './core/use-cases/get-project-list-use-case';
import {createGetProjectUseCase} from './core/use-cases/get-project-use-case';
import {createGetProjectUsersUseCase} from './core/use-cases/get-project-users-use-case';
import {createGetSdkConfigUseCase} from './core/use-cases/get-sdk-config-use-case';
import {createGetSdkConfigsUseCase} from './core/use-cases/get-sdk-configs-use-case';
import {createGetWorkspaceListUseCase} from './core/use-cases/get-workspace-list-use-case';
import {createGetWorkspaceMembersUseCase} from './core/use-cases/get-workspace-members-use-case';
import {createGetWorkspaceUseCase} from './core/use-cases/get-workspace-use-case';
import {createPatchProjectUseCase} from './core/use-cases/patch-project-use-case';
import {createRejectAllPendingConfigProposalsUseCase} from './core/use-cases/reject-all-pending-config-proposals-use-case';
import {createRejectConfigProposalUseCase} from './core/use-cases/reject-config-proposal-use-case';
import {createRemoveWorkspaceMemberUseCase} from './core/use-cases/remove-workspace-member-use-case';
import {createRestoreConfigVersionUseCase} from './core/use-cases/restore-config-version-use-case';
import {createUpdateConfigUseCase} from './core/use-cases/update-config-use-case';
import {createUpdateProjectEnvironmentUseCase} from './core/use-cases/update-project-environment-use-case';
import {createUpdateProjectEnvironmentsOrderUseCase} from './core/use-cases/update-project-environments-order-use-case';
import {createUpdateProjectUsersUseCase} from './core/use-cases/update-project-users-use-case';
import {createUpdateWorkspaceMemberRoleUseCase} from './core/use-cases/update-workspace-member-role-use-case';
import {createUpdateWorkspaceUseCase} from './core/use-cases/update-workspace-use-case';
import {UserStore} from './core/user-store';
import {runTransactional} from './core/utils';

export interface EngineOptions {
  logLevel: LogLevel;
  databaseUrl: string;
  dbSchema: string;
  dateProvider?: DateProvider;
  onConflictRetriesCount?: number;
  onFatalError: (error: unknown) => void;
  replicaStorage:
    | {type: 'memory'}
    | {type: 'file'; path: string; cacheSizeKb?: number; unsynced?: boolean}; // 128MB=131072, 256MB=262144, 512MB=524288
}

interface ToUseCaseOptions {
  onConflictRetriesCount: number;
  dateProvider: DateProvider;
  useCaseName: string;
}

function toUseCase<TReq, TRes>(
  db: Kysely<DB>,
  logger: Logger,
  useCase: TransactionalUseCase<TReq, TRes>,
  options: ToUseCaseOptions,
): UseCase<TReq, TRes> {
  return async (ctx: Context, req: TReq) => {
    return await runTransactional({
      ctx,
      db,
      logger,
      onConflictRetriesCount: options.onConflictRetriesCount,
      fn: async (ctx, dbTx, scheduleOptimisticEffect) => {
        const hub = new EventHubPublisher(dbTx, logger, options.dateProvider);
        const configs = new ConfigStore(dbTx, hub);
        const configProposals = new ConfigProposalStore(dbTx);
        const users = new UserStore(dbTx);
        const configUsers = new ConfigUserStore(dbTx);
        const sdkKeys = new SdkKeyStore(dbTx);
        const auditLogs = new AuditLogStore(dbTx);
        const projectUsers = new ProjectUserStore(dbTx);
        const projects = new ProjectStore(dbTx);
        const projectEnvironments = new ProjectEnvironmentStore(dbTx);
        const workspaces = new WorkspaceStore(dbTx);
        const workspaceMembers = new WorkspaceMemberStore(dbTx);
        const configVariants = new ConfigVariantStore(dbTx);
        const configVariantVersions = new ConfigVariantVersionStore(dbTx);
        const permissionService = new PermissionService(
          configUsers,
          projectUsers,
          configs,
          projects,
          workspaceMembers,
          logger,
        );
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
          workspaces,
          workspaceMembers,
          db: dbTx,
        };
        const result = await useCase(ctx, tx, req);
        return result;
      },
    });
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

  const services: Service[] = [apiTokenService, replicaService];

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
    approveConfigProposal: createApproveConfigProposalUseCase({
      dateProvider,
    }),
    rejectConfigProposal: createRejectConfigProposalUseCase({dateProvider}),
    rejectAllPendingConfigProposals: createRejectAllPendingConfigProposalsUseCase({}),
    getConfigProposal: createGetConfigProposalUseCase({}),
    getConfigProposalList: createGetConfigProposalListUseCase(),
    updateConfig: createUpdateConfigUseCase(),
    getConfig: createGetConfigUseCase({}),
    deleteConfig: createDeleteConfigUseCase({}),
    getConfigVariantVersionList: createGetConfigVariantVersionListUseCase(),
    getConfigVariantVersion: createGetConfigVariantVersionUseCase(),
    getApiKeyList: createGetApiKeyListUseCase(),
    getApiKey: createGetApiKeyUseCase(),
    deleteApiKey: createDeleteApiKeyUseCase(),
    getProjectList: createGetProjectListUseCase(),
    getProject: createGetProjectUseCase(),
    createProject: createCreateProjectUseCase(),
    deleteProject: createDeleteProjectUseCase({}),
    patchProject: createPatchProjectUseCase(),
    getProjectUsers: createGetProjectUsersUseCase(),
    updateProjectUsers: createUpdateProjectUsersUseCase(),
    getProjectEnvironments: createGetProjectEnvironmentsUseCase(),
    createProjectEnvironment: createCreateProjectEnvironmentUseCase({dateProvider}),
    updateProjectEnvironment: createUpdateProjectEnvironmentUseCase({dateProvider}),
    updateProjectEnvironmentsOrder: createUpdateProjectEnvironmentsOrderUseCase({dateProvider}),
    deleteProjectEnvironment: createDeleteProjectEnvironmentUseCase({dateProvider}),
    restoreConfigVersion: createRestoreConfigVersionUseCase(),
    createApiKey: createCreateApiKeyUseCase({tokenHasher}),
    // Workspace use cases
    createWorkspace: createCreateWorkspaceUseCase(),
    getWorkspace: createGetWorkspaceUseCase(),
    getWorkspaceList: createGetWorkspaceListUseCase(),
    updateWorkspace: createUpdateWorkspaceUseCase(),
    deleteWorkspace: createDeleteWorkspaceUseCase(),
    getWorkspaceMembers: createGetWorkspaceMembersUseCase(),
    addWorkspaceMember: createAddWorkspaceMemberUseCase(),
    removeWorkspaceMember: createRemoveWorkspaceMemberUseCase(),
    updateWorkspaceMemberRole: createUpdateWorkspaceMemberRoleUseCase(),
  } satisfies UseCaseMap;

  const engineUseCases = {} as InferEngineUserCaseMap<typeof transactionalUseCases>;

  for (const name of Object.keys(transactionalUseCases) as Array<keyof typeof engineUseCases>) {
    engineUseCases[name] = toUseCase(db, logger, (transactionalUseCases as UseCaseMap)[name], {
      onConflictRetriesCount: options.onConflictRetriesCount ?? 16,
      dateProvider,
      useCaseName: name,
    });
    engineUseCases[name] = addUseCaseLogging(engineUseCases[name], name, logger);
  }

  return {
    useCases: {
      ...engineUseCases,
      getConfigValue: createGetConfigValueUseCase({configsReplica: replicaService}),
      getSdkConfig: createGetSdkConfigUseCase({replicaService: replicaService}),
      getSdkConfigs: createGetSdkConfigsUseCase({configsReplica: replicaService}),
      getHealth: createGetHealthUseCase(),
      getProjectEvents: createGetProjectEventsUseCase({
        replicaEventsBus: replicaEventsBus,
        replicaService: replicaService,
      }),
    },
    verifyApiKey: apiTokenService.verifyApiKey.bind(apiTokenService),
    testing: {
      pool,
      dbSchema: options.dbSchema,
      auditLogs: new AuditLogStore(db),
      projects: new ProjectStore(db),
      configProposals: new ConfigProposalStore(db),
      configVariants: new ConfigVariantStore(db),
      workspaceMembers: new WorkspaceMemberStore(db),
      dropDb: (ctx: Context) => dropDb(ctx, {pool, dbSchema: options.dbSchema, logger}),
    },
    stop: async () => {
      for (const service of services) {
        logger.info(GLOBAL_CONTEXT, {msg: `Stopping service: ${service.name}...`});
        await service.stop(GLOBAL_CONTEXT);
      }
      freePool();
    },
  };
}

async function tryUnlink(path: string) {
  if (await fs.stat(path).catch(() => false)) {
    await fs.unlink(path);
  }
}

async function openSqlite(
  options: EngineOptions['replicaStorage'],
): Promise<BetterSqlite3.Database> {
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
