/* eslint-disable react-hooks/rules-of-hooks */

import {Kysely} from 'kysely';
import {Pool} from 'pg';
import {ConfigQueryService} from './core/config-query-service';
import {ConfigService} from './core/config-service';
import {type Context, GLOBAL_CONTEXT} from './core/context';
import {type DateProvider, DefaultDateProvider} from './core/date-provider';
import type {DB} from './core/db';
import {type EmailService, PreferencesAwareEmailService} from './core/email-service';
import {EventHubPublisher} from './core/event-hub';
import {createSha256HashingService} from './core/hashing-service';
import {createLogger, type Logger, type LogLevel} from './core/logger';
import {PermissionService} from './core/permission-service';
import {prepareDb} from './core/prepare-db';
import {ProjectQueryService} from './core/project-query-service';
import {ProposalService} from './core/proposal-service';
import {type AppHubEvents} from './core/replica';
import {AuditLogStore} from './core/stores/audit-log-store';
import {ConfigProposalStore} from './core/stores/config-proposal-store';
import {ConfigStore} from './core/stores/config-store';
import {ConfigUserStore} from './core/stores/config-user-store';
import {ConfigVariantStore} from './core/stores/config-variant-store';
import {ConfigVersionStore} from './core/stores/config-version-store';
import {ProjectEnvironmentStore} from './core/stores/project-environment-store';
import {ProjectStore} from './core/stores/project-store';
import {ProjectUserStore} from './core/stores/project-user-store';
import {SdkKeyStore} from './core/stores/sdk-key-store';
import {UserNotificationPreferencesStore} from './core/stores/user-notification-preferences-store';
import {WorkspaceMemberStore} from './core/stores/workspace-member-store';
import {WorkspaceStore} from './core/stores/workspace-store';
import type {TransactionalUseCase, UseCase, UseCaseTransaction} from './core/use-case';
import {createAddExampleConfigsUseCase} from './core/use-cases/add-example-configs-use-case';
import {createAddWorkspaceMemberUseCase} from './core/use-cases/add-workspace-member-use-case';
import {createApproveConfigProposalUseCase} from './core/use-cases/approve-config-proposal-use-case';
import {createCreateConfigProposalUseCase} from './core/use-cases/create-config-proposal-use-case';
import {createCreateConfigUseCase} from './core/use-cases/create-config-use-case';
import {createCreateProjectEnvironmentUseCase} from './core/use-cases/create-project-environment-use-case';
import {createCreateProjectUseCase} from './core/use-cases/create-project-use-case';
import {createCreateSdkKeyUseCase} from './core/use-cases/create-sdk-key-use-case';
import {createCreateWorkspaceUseCase} from './core/use-cases/create-workspace-use-case';
import {createDeleteConfigUseCase} from './core/use-cases/delete-config-use-case';
import {createDeleteProjectEnvironmentUseCase} from './core/use-cases/delete-project-environment-use-case';
import {createDeleteProjectUseCase} from './core/use-cases/delete-project-use-case';
import {createDeleteSdkKeyUseCase} from './core/use-cases/delete-sdk-key-use-case';
import {createDeleteUserAccountUseCase} from './core/use-cases/delete-user-account-use-case';
import {createDeleteWorkspaceUseCase} from './core/use-cases/delete-workspace-use-case';
import {createGetAppLayoutDataUseCase} from './core/use-cases/get-app-layout-data-use-case';
import {createGetAuditLogMessageUseCase} from './core/use-cases/get-audit-log-message-use-case';
import {createGetAuditLogUseCase} from './core/use-cases/get-audit-log-use-case';
import {createGetConfigListUseCase} from './core/use-cases/get-config-list-use-case';
import {createGetConfigPageDataUseCase} from './core/use-cases/get-config-page-data-use-case';
import {createGetConfigProposalListUseCase} from './core/use-cases/get-config-proposal-list-use-case';
import {createGetConfigProposalUseCase} from './core/use-cases/get-config-proposal-use-case';
import {createGetConfigUseCase} from './core/use-cases/get-config-use-case';
import {createGetConfigVariantVersionListUseCase} from './core/use-cases/get-config-variant-version-list-use-case';
import {createGetConfigVariantVersionUseCase} from './core/use-cases/get-config-variant-version-use-case';
import {createGetConfigVersionListUseCase} from './core/use-cases/get-config-version-list-use-case';
import {createGetHealthUseCase} from './core/use-cases/get-health-use-case';
import {createGetNewConfigPageDataUseCase} from './core/use-cases/get-new-config-page-data-use-case';
import {createGetNewSdkKeyPageDataUseCase} from './core/use-cases/get-new-sdk-key-page-data-use-case';
import {createGetNotificationPreferencesUseCase} from './core/use-cases/get-notification-preferences-use-case';
import {createGetProjectConfigTypesUseCase} from './core/use-cases/get-project-config-types-use-case';
import {createGetProjectEnvironmentsUseCase} from './core/use-cases/get-project-environments-use-case';
import {createGetProjectListUseCase} from './core/use-cases/get-project-list-use-case';
import {createGetProjectUseCase} from './core/use-cases/get-project-use-case';
import {createGetProjectUsersUseCase} from './core/use-cases/get-project-users-use-case';
import {createGetSdkKeyListUseCase} from './core/use-cases/get-sdk-key-list-use-case';
import {createGetSdkKeyPageDataUseCase} from './core/use-cases/get-sdk-key-page-data-use-case';
import {createGetSdkKeyUseCase} from './core/use-cases/get-sdk-key-use-case';
import {createGetStatusUseCase} from './core/use-cases/get-status-use-case';
import {createGetWorkspaceListUseCase} from './core/use-cases/get-workspace-list-use-case';
import {createGetWorkspaceMembersUseCase} from './core/use-cases/get-workspace-members-use-case';
import {createGetWorkspaceUseCase} from './core/use-cases/get-workspace-use-case';
import {createHasUsersUseCase} from './core/use-cases/has-users-use-case';
import {createInitUserUseCase} from './core/use-cases/init-user-use-case';
import {createPatchProjectUseCase} from './core/use-cases/patch-project-use-case';
import {createRegisterWithPasswordUseCase} from './core/use-cases/register-with-password-use-case';
import {createRejectAllPendingConfigProposalsUseCase} from './core/use-cases/reject-all-pending-config-proposals-use-case';
import {createRejectConfigProposalUseCase} from './core/use-cases/reject-config-proposal-use-case';
import {createRemoveWorkspaceMemberUseCase} from './core/use-cases/remove-workspace-member-use-case';
import {createRestoreConfigVersionUseCase} from './core/use-cases/restore-config-version-use-case';
import {createUpdateConfigUseCase} from './core/use-cases/update-config-use-case';
import {createUpdateNotificationPreferencesUseCase} from './core/use-cases/update-notification-preferences-use-case';
import {createUpdateProjectEnvironmentUseCase} from './core/use-cases/update-project-environment-use-case';
import {createUpdateProjectEnvironmentsOrderUseCase} from './core/use-cases/update-project-environments-order-use-case';
import {createUpdateProjectUsersUseCase} from './core/use-cases/update-project-users-use-case';
import {createUpdateWorkspaceMemberRoleUseCase} from './core/use-cases/update-workspace-member-role-use-case';
import {createUpdateWorkspaceUseCase} from './core/use-cases/update-workspace-use-case';
import {createVerifyPasswordCredentialsUseCase} from './core/use-cases/verify-password-credentials-use-case';
import {UserStore} from './core/user-store';
import {runTransactional} from './core/utils';
import {WorkspaceMemberService} from './core/workspace-member-service';
import {WorkspaceQueryService} from './core/workspace-query-service';

export interface EngineOptions {
  logLevel: LogLevel;
  databaseUrl: string;
  dbSchema: string;
  dateProvider?: DateProvider;
  onConflictRetriesCount?: number;
  emailService?: EmailService;
  baseUrl: string;
  passwordAuthEnabled?: boolean;
}

interface ToUseCaseOptions {
  onConflictRetriesCount: number;
  dateProvider: DateProvider;
  useCaseName: string;
  emailService?: EmailService;
  baseUrl: string;
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
        const hub = new EventHubPublisher<AppHubEvents>(dbTx, logger, options.dateProvider);
        const configs = new ConfigStore(dbTx, hub);
        const configProposals = new ConfigProposalStore(dbTx);
        const users = new UserStore(dbTx);
        const configUsers = new ConfigUserStore(dbTx);
        const sdkKeys = new SdkKeyStore(dbTx, hub);
        const auditLogs = new AuditLogStore(dbTx);
        const projectUsers = new ProjectUserStore(dbTx);
        const projects = new ProjectStore(dbTx);
        const projectEnvironments = new ProjectEnvironmentStore(dbTx);
        const workspaces = new WorkspaceStore(dbTx);
        const workspaceMembers = new WorkspaceMemberStore(dbTx);
        const userNotificationPreferences = new UserNotificationPreferencesStore(dbTx);
        const configVariants = new ConfigVariantStore(dbTx);
        const configVersions = new ConfigVersionStore(dbTx);
        const permissionService = new PermissionService(
          configUsers,
          projectUsers,
          configs,
          projects,
          workspaceMembers,
          logger,
        );
        // Wrap email service with preferences-aware decorator
        const preferencesAwareEmailService = options.emailService
          ? new PreferencesAwareEmailService(
              options.emailService,
              users,
              userNotificationPreferences,
            )
          : undefined;

        const proposalService = new ProposalService({
          configProposals,
          configs,
          projects,
          users,
          auditLogs,
          dateProvider: options.dateProvider,
          scheduleOptimisticEffect,
          emailService: preferencesAwareEmailService,
          baseUrl: options.baseUrl,
        });
        const configService = new ConfigService(
          configs,
          configProposals,
          configUsers,
          permissionService,
          auditLogs,
          options.dateProvider,
          projectEnvironments,
          configVariants,
          configVersions,
          proposalService,
        );
        const workspaceMemberService = new WorkspaceMemberService(workspaceMembers, projectUsers);

        // Query services
        const configQueryService = new ConfigQueryService(
          configs,
          configUsers,
          configVariants,
          configProposals,
          projectUsers,
        );
        const projectQueryService = new ProjectQueryService(
          projects,
          projectEnvironments,
          projectUsers,
        );
        const workspaceQueryService = new WorkspaceQueryService(
          workspaces,
          workspaceMembers,
          projects,
          projectUsers,
          projectEnvironments,
          configs,
          configService,
          users,
          auditLogs,
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
          configVersions,
          workspaces,
          workspaceMembers,
          userNotificationPreferences,
          workspaceMemberService,
          proposalService,
          emailService: preferencesAwareEmailService,
          dateProvider: options.dateProvider,
          configQueryService,
          projectQueryService,
          workspaceQueryService,
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

export interface SdkKeyInfo {
  projectId: string;
  environmentId: string;
}

export async function createEngine(options: EngineOptions) {
  const logger = createLogger({level: options.logLevel});

  logger.info(GLOBAL_CONTEXT, {msg: 'Creating engine...'});

  const {db, pool, freePool} = await prepareDb(GLOBAL_CONTEXT, logger, options);

  const dateProvider = options.dateProvider ?? new DefaultDateProvider();

  const hasher = createSha256HashingService();

  const transactionalUseCases = {
    getConfigList: createGetConfigListUseCase({}),
    getAuditLog: createGetAuditLogUseCase(),
    getAuditLogMessage: createGetAuditLogMessageUseCase(),
    createConfig: createCreateConfigUseCase({dateProvider}),
    createConfigProposal: createCreateConfigProposalUseCase({
      dateProvider,
      baseUrl: options.baseUrl,
    }),
    approveConfigProposal: createApproveConfigProposalUseCase({
      dateProvider,
      baseUrl: options.baseUrl,
    }),
    rejectConfigProposal: createRejectConfigProposalUseCase(),
    rejectAllPendingConfigProposals: createRejectAllPendingConfigProposalsUseCase(),
    getConfigProposal: createGetConfigProposalUseCase({}),
    getConfigProposalList: createGetConfigProposalListUseCase(),
    updateConfig: createUpdateConfigUseCase(),
    getConfig: createGetConfigUseCase({}),
    deleteConfig: createDeleteConfigUseCase({}),
    getConfigVariantVersionList: createGetConfigVariantVersionListUseCase(),
    getConfigVariantVersion: createGetConfigVariantVersionUseCase(),
    getConfigVersionList: createGetConfigVersionListUseCase(),
    getSdkKeyList: createGetSdkKeyListUseCase(),
    getSdkKey: createGetSdkKeyUseCase(),
    deleteSdkKey: createDeleteSdkKeyUseCase(),
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
    createSdkKey: createCreateSdkKeyUseCase({hasher: hasher}),
    // Combined use cases for page data
    getConfigPageData: createGetConfigPageDataUseCase(),
    getNewConfigPageData: createGetNewConfigPageDataUseCase(),
    getSdkKeyPageData: createGetSdkKeyPageDataUseCase(),
    getNewSdkKeyPageData: createGetNewSdkKeyPageDataUseCase(),
    getProjectConfigTypes: createGetProjectConfigTypesUseCase(),
    getAppLayoutData: createGetAppLayoutDataUseCase(),
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
    addExampleConfigs: createAddExampleConfigsUseCase(),
    // User account use cases
    initUser: createInitUserUseCase(),
    deleteUserAccount: createDeleteUserAccountUseCase(),
    registerWithPassword: createRegisterWithPasswordUseCase({
      passwordAuthEnabled: options.passwordAuthEnabled ?? false,
      logger,
    }),
    verifyPasswordCredentials: createVerifyPasswordCredentialsUseCase({
      passwordAuthEnabled: options.passwordAuthEnabled ?? false,
      logger,
    }),
    hasUsers: createHasUsersUseCase(),
    // Notification preferences use cases
    getNotificationPreferences: createGetNotificationPreferencesUseCase(),
    updateNotificationPreferences: createUpdateNotificationPreferencesUseCase(),
  } satisfies UseCaseMap;

  const engineUseCases = {} as InferEngineUserCaseMap<typeof transactionalUseCases>;

  for (const name of Object.keys(transactionalUseCases) as Array<keyof typeof engineUseCases>) {
    engineUseCases[name] = toUseCase(db, logger, (transactionalUseCases as UseCaseMap)[name], {
      onConflictRetriesCount: options.onConflictRetriesCount ?? 16,
      dateProvider,
      useCaseName: name,
      emailService: options.emailService,
      baseUrl: options.baseUrl,
    });
    engineUseCases[name] = addUseCaseLogging(engineUseCases[name], name, logger);
  }

  return {
    useCases: {
      ...engineUseCases,
      getHealth: createGetHealthUseCase(),
      getStatus: createGetStatusUseCase({db}),
    },
    mail: options.emailService,
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
      freePool();
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

export type Engine = Awaited<ReturnType<typeof createEngine>>;
