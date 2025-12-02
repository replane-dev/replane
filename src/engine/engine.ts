/* eslint-disable react-hooks/rules-of-hooks */

import {Kysely, PostgresDialect} from 'kysely';
import {Pool} from 'pg';
import {ApiTokenService} from './core/api-token-service';
import {ConfigService} from './core/config-service';
import {type ConfigReplicaEvent, ConfigsReplicaService} from './core/configs-replica-service';
import {type Context, GLOBAL_CONTEXT} from './core/context';
import {type DateProvider, DefaultDateProvider} from './core/date-provider';
import type {DB} from './core/db';
import type {EventBusClient} from './core/event-bus';
import {createLogger, type Logger, type LogLevel} from './core/logger';
import {migrate} from './core/migrations';
import {PermissionService} from './core/permission-service';
import {
  PgEventBusClient,
  type PgEventBusClientNotificationHandler,
} from './core/pg-event-bus-client';
import {getPgPool} from './core/pg-pool-cache';
import type {Service} from './core/service';
import {AuditLogStore} from './core/stores/audit-log-store';
import {ConfigProposalStore} from './core/stores/config-proposal-store';
import {ConfigStore} from './core/stores/config-store';
import {ConfigUserStore} from './core/stores/config-user-store';
import {
  type ConfigVariantChangePayload,
  ConfigVariantStore,
} from './core/stores/config-variant-store';
import {ConfigVariantVersionStore} from './core/stores/config-variant-version-store';
import {OrganizationMemberStore} from './core/stores/organization-member-store';
import {OrganizationStore} from './core/stores/organization-store';
import {ProjectEnvironmentStore} from './core/stores/project-environment-store';
import {ProjectStore} from './core/stores/project-store';
import {ProjectUserStore} from './core/stores/project-user-store';
import {SdkKeyStore} from './core/stores/sdk-key-store';
import {Subject} from './core/subject';
import {createSha256TokenHashingService} from './core/token-hashing-service';
import type {TransactionalUseCase, UseCase, UseCaseTransaction} from './core/use-case';
import {createAddOrganizationMemberUseCase} from './core/use-cases/add-organization-member-use-case';
import {createApproveConfigProposalUseCase} from './core/use-cases/approve-config-proposal-use-case';
import {createCreateApiKeyUseCase} from './core/use-cases/create-api-key-use-case';
import {createCreateConfigProposalUseCase} from './core/use-cases/create-config-proposal-use-case';
import {createCreateConfigUseCase} from './core/use-cases/create-config-use-case';
import {createCreateOrganizationUseCase} from './core/use-cases/create-organization-use-case';
import {createCreateProjectEnvironmentUseCase} from './core/use-cases/create-project-environment-use-case';
import {createCreateProjectUseCase} from './core/use-cases/create-project-use-case';
import {createDeleteApiKeyUseCase} from './core/use-cases/delete-api-key-use-case';
import {createDeleteConfigUseCase} from './core/use-cases/delete-config-use-case';
import {createDeleteOrganizationUseCase} from './core/use-cases/delete-organization-use-case';
import {createDeleteProjectEnvironmentUseCase} from './core/use-cases/delete-project-environment-use-case';
import {createDeleteProjectUseCase} from './core/use-cases/delete-project-use-case';
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
import {createGetOrganizationListUseCase} from './core/use-cases/get-organization-list-use-case';
import {createGetOrganizationMembersUseCase} from './core/use-cases/get-organization-members-use-case';
import {createGetOrganizationUseCase} from './core/use-cases/get-organization-use-case';
import {createGetProjectEnvironmentsUseCase} from './core/use-cases/get-project-environments-use-case';
import {createGetProjectEventsUseCase} from './core/use-cases/get-project-events-use-case';
import {createGetProjectListUseCase} from './core/use-cases/get-project-list-use-case';
import {createGetProjectUseCase} from './core/use-cases/get-project-use-case';
import {createGetProjectUsersUseCase} from './core/use-cases/get-project-users-use-case';
import {createGetSdkConfigUseCase} from './core/use-cases/get-sdk-config-use-case';
import {createGetSdkConfigsUseCase} from './core/use-cases/get-sdk-configs-use-case';
import {createPatchConfigUseCase} from './core/use-cases/patch-config-use-case';
import {createPatchConfigVariantUseCase} from './core/use-cases/patch-config-variant-use-case';
import {createPatchProjectUseCase} from './core/use-cases/patch-project-use-case';
import {createRejectAllPendingConfigProposalsUseCase} from './core/use-cases/reject-all-pending-config-proposals-use-case';
import {createRejectConfigProposalUseCase} from './core/use-cases/reject-config-proposal-use-case';
import {createRemoveOrganizationMemberUseCase} from './core/use-cases/remove-organization-member-use-case';
import {createRestoreConfigVariantVersionUseCase} from './core/use-cases/restore-config-variant-version-use-case';
import {createUpdateOrganizationMemberRoleUseCase} from './core/use-cases/update-organization-member-role-use-case';
import {createUpdateOrganizationUseCase} from './core/use-cases/update-organization-use-case';
import {createUpdateProjectEnvironmentUseCase} from './core/use-cases/update-project-environment-use-case';
import {createUpdateProjectEnvironmentsOrderUseCase} from './core/use-cases/update-project-environments-order-use-case';
import {createUpdateProjectUsersUseCase} from './core/use-cases/update-project-users-use-case';
import {UserStore} from './core/user-store';
import {runTransactional} from './core/utils';

export interface EngineOptions {
  logLevel: LogLevel;
  databaseUrl: string;
  dbSchema: string;
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
        const configs = new ConfigStore(dbTx);
        const configProposals = new ConfigProposalStore(dbTx);
        const users = new UserStore(dbTx);
        const configUsers = new ConfigUserStore(dbTx);
        const sdkKeys = new SdkKeyStore(dbTx);
        const auditLogs = new AuditLogStore(dbTx);
        const projectUsers = new ProjectUserStore(dbTx);
        const projects = new ProjectStore(dbTx);
        const projectEnvironments = new ProjectEnvironmentStore(dbTx);
        const organizations = new OrganizationStore(dbTx);
        const organizationMembers = new OrganizationMemberStore(dbTx);
        const configVariants = new ConfigVariantStore(
          dbTx,
          scheduleOptimisticEffect,
          options.listener,
        );
        const configVariantVersions = new ConfigVariantVersionStore(dbTx);
        const permissionService = new PermissionService(
          configUsers,
          projectUsers,
          configs,
          projects,
          organizationMembers,
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
          organizations,
          organizationMembers,
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

  const configsReplica = new ConfigsReplicaService({
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
    approveConfigProposal: createApproveConfigProposalUseCase({
      dateProvider,
    }),
    rejectConfigProposal: createRejectConfigProposalUseCase({dateProvider}),
    rejectAllPendingConfigProposals: createRejectAllPendingConfigProposalsUseCase({}),
    getConfigProposal: createGetConfigProposalUseCase({}),
    getConfigProposalList: createGetConfigProposalListUseCase(),
    patchConfig: createPatchConfigUseCase({dateProvider}),
    patchConfigVariant: createPatchConfigVariantUseCase({
      dateProvider,
    }),
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
    restoreConfigVariantVersion: createRestoreConfigVariantVersionUseCase({dateProvider}),
    createApiKey: createCreateApiKeyUseCase({tokenHasher}),
    // Organization use cases
    createOrganization: createCreateOrganizationUseCase(),
    getOrganization: createGetOrganizationUseCase(),
    getOrganizationList: createGetOrganizationListUseCase(),
    updateOrganization: createUpdateOrganizationUseCase(),
    deleteOrganization: createDeleteOrganizationUseCase(),
    getOrganizationMembers: createGetOrganizationMembersUseCase(),
    addOrganizationMember: createAddOrganizationMemberUseCase(),
    removeOrganizationMember: createRemoveOrganizationMemberUseCase(),
    updateOrganizationMemberRole: createUpdateOrganizationMemberRoleUseCase(),
  } satisfies UseCaseMap;

  const engineUseCases = {} as InferEngineUserCaseMap<typeof transactionalUseCases>;

  for (const name of Object.keys(transactionalUseCases) as Array<keyof typeof engineUseCases>) {
    engineUseCases[name] = toUseCase(db, logger, (transactionalUseCases as UseCaseMap)[name], {
      onConflictRetriesCount: options.onConflictRetriesCount ?? 16,
      listener: eventBusClient,
      dateProvider,
      useCaseName: name,
    });
    engineUseCases[name] = addUseCaseLogging(engineUseCases[name], name, logger);
  }

  return {
    useCases: {
      ...engineUseCases,
      getConfigValue: createGetConfigValueUseCase({configsReplica}),
      getSdkConfig: createGetSdkConfigUseCase({configsReplica}),
      getSdkConfigs: createGetSdkConfigsUseCase({configsReplica}),
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
      configVariants: new ConfigVariantStore(db, () => {}, eventBusClient),
      organizationMembers: new OrganizationMemberStore(db),
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
