import type {ApiTokenStore} from './api-token-store';
import type {AuditMessageStore} from './audit-message-store';
import {ConfigStore} from './config-store';
import type {ConfigUserStore} from './config-user-store';
import type {ConfigVersionStore} from './config-version-store';
import type {Context} from './context';
import type {PermissionService} from './permission-service';
import type {ProjectStore} from './project-store';
import type {ProjectUserStore} from './project-user-store';
import type {UserStore} from './user-store';

export interface UseCase<TRequest, TResponse> {
  (ctx: Context, tx: UseCaseTransaction, request: TRequest): Promise<TResponse>;
}

export interface UseCaseTransaction {
  configs: ConfigStore;
  users: UserStore;
  configUsers: ConfigUserStore;
  configVersions: ConfigVersionStore;
  permissionService: PermissionService;
  apiTokens: ApiTokenStore;
  auditMessages: AuditMessageStore;
  projectUsers: ProjectUserStore;
  projects: ProjectStore;
}
