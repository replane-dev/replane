import type {Identity} from '../identity';
import {isUserIdentity} from '../identity';
import {combineConfigAndProjectRoles} from '../role-utils';
import type {TransactionalUseCase} from '../use-case';
import type {ConfigInfo} from '../zod';

export interface GetConfigListRequest {
  identity: Identity;
  projectId: string;
}

export interface GetConfigListResponse {
  configs: ConfigInfo[];
}

export interface GetConfigListUseCasesDeps {}

export function createGetConfigListUseCase({}: GetConfigListUseCasesDeps): TransactionalUseCase<
  GetConfigListRequest,
  GetConfigListResponse
> {
  return async (ctx, tx, req) => {
    await tx.permissionService.ensureCanReadConfigs(ctx, {
      projectId: req.projectId,
      identity: req.identity,
    });

    const currentUserEmail = isUserIdentity(req.identity) ? req.identity.email : undefined;

    // For API keys, we don't have project/config roles
    const myProjectRole = currentUserEmail
      ? await tx.projectUsers.getByProjectIdAndEmail({
          projectId: req.projectId,
          userEmail: currentUserEmail,
        })
      : null;

    const configs = await tx.configs.getProjectConfigs({
      currentUserEmail,
      projectId: req.projectId,
    });

    return {
      configs: configs.map(config => ({
        ...config,
        myRole: myProjectRole
          ? combineConfigAndProjectRoles(myProjectRole.role, config.myRole)
          : config.myRole,
      })),
    };
  };
}
