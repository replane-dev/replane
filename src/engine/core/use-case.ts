import type {ApiTokenStore} from './api-token-store';
import type {AuditMessageStore} from './audit-message-store';
import type {ConfigProposalStore} from './config-proposal-store';
import type {ConfigService} from './config-service';
import type {ConfigStore} from './config-store';
import type {ConfigUserStore} from './config-user-store';
import type {ConfigVersionStore} from './config-version-store';
import type {Context} from './context';
import type {PermissionService} from './permission-service';
import type {ProjectStore} from './project-store';
import type {ProjectUserStore} from './project-user-store';
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
  configVersions: ConfigVersionStore;
  permissionService: PermissionService;
  apiTokens: ApiTokenStore;
  auditMessages: AuditMessageStore;
  projectUsers: ProjectUserStore;
  projects: ProjectStore;
}
