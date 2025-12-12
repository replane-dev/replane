import type {ConfigQueryService} from './config-query-service';
import type {ConfigService} from './config-service';
import type {Context} from './context';
import type {PermissionService} from './permission-service';
import type {ProjectQueryService} from './project-query-service';
import type {AuditLogStore} from './stores/audit-log-store';
import type {ConfigProposalStore} from './stores/config-proposal-store';
import type {ConfigStore} from './stores/config-store';
import type {ConfigUserStore} from './stores/config-user-store';
import type {ConfigVariantStore} from './stores/config-variant-store';
import type {ConfigVariantVersionStore} from './stores/config-variant-version-store';
import type {ProjectEnvironmentStore} from './stores/project-environment-store';
import type {ProjectStore} from './stores/project-store';
import type {ProjectUserStore} from './stores/project-user-store';
import type {SdkKeyStore} from './stores/sdk-key-store';
import type {WorkspaceMemberStore} from './stores/workspace-member-store';
import type {WorkspaceStore} from './stores/workspace-store';
import type {UserStore} from './user-store';
import type {WorkspaceMemberService} from './workspace-member-service';
import type {WorkspaceQueryService} from './workspace-query-service';
import type {NormalizedEmail} from './zod';

export interface ProjectRequest {
  projectId: string;
  currentUserEmail: NormalizedEmail;
}

export interface TransactionalProjectUseCase<TRequest extends ProjectRequest, TResponse> {
  (ctx: Context, tx: UseCaseTransaction, request: TRequest): Promise<TResponse>;
}

export interface TransactionalUseCase<TRequest, TResponse> {
  (ctx: Context, tx: UseCaseTransaction, request: TRequest): Promise<TResponse>;
}

export interface UseCase<TRequest, TResponse> {
  (ctx: Context, request: TRequest): Promise<TResponse>;
}

export interface UseCaseTransaction {
  scheduleOptimisticEffect(effect: () => Promise<void>): void;
  configs: ConfigStore;
  configProposals: ConfigProposalStore;
  configService: ConfigService;
  users: UserStore;
  configUsers: ConfigUserStore;
  permissionService: PermissionService;
  sdkKeys: SdkKeyStore;
  auditLogs: AuditLogStore;
  projectUsers: ProjectUserStore;
  projects: ProjectStore;
  // New stores for environment support
  projectEnvironments: ProjectEnvironmentStore;
  configVariants: ConfigVariantStore;
  configVariantVersions: ConfigVariantVersionStore;
  // Workspace stores
  workspaces: WorkspaceStore;
  workspaceMembers: WorkspaceMemberStore;
  // Services
  workspaceMemberService: WorkspaceMemberService;
  // Query services
  configQueryService: ConfigQueryService;
  projectQueryService: ProjectQueryService;
  workspaceQueryService: WorkspaceQueryService;
  // Needed for permission checks
  db: any;
}
