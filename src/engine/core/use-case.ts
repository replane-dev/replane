import type {AuditLogStore} from './audit-log-store';
import type {ConfigProposalStore} from './config-proposal-store';
import type {ConfigService} from './config-service';
import type {ConfigStore} from './config-store';
import type {ConfigUserStore} from './config-user-store';
import type {ConfigVariantStore} from './config-variant-store';
import type {ConfigVariantVersionStore} from './config-variant-version-store';
import type {Context} from './context';
import type {OrganizationMemberStore} from './organization-member-store';
import type {OrganizationStore} from './organization-store';
import type {PermissionService} from './permission-service';
import type {ProjectEnvironmentStore} from './project-environment-store';
import type {ProjectStore} from './project-store';
import type {ProjectUserStore} from './project-user-store';
import type {SdkKeyStore} from './sdk-key-store';
import type {UserStore} from './user-store';

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
  // Organization stores
  organizations: OrganizationStore;
  organizationMembers: OrganizationMemberStore;
  // Needed for permission checks
  db: any;
}
