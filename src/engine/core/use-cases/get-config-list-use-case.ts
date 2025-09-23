import {combineConfigAndProjectRoles} from '../role-utils';
import type {TransactionalUseCase} from '../use-case';
import type {ConfigInfo, NormalizedEmail} from '../zod';

export interface GetConfigListRequest {
  currentUserEmail: NormalizedEmail;
  projectId: string;
}

export interface GetConfigListResponse {
  configs: ConfigInfo[];
}

export interface GetConfigListUseCasesDeps {}

export function createGetConfigListUseCase(
  deps: GetConfigListUseCasesDeps,
): TransactionalUseCase<GetConfigListRequest, GetConfigListResponse> {
  return async (ctx, tx, req) => {
    const myProjectRole = await tx.projectUsers.getByProjectIdAndEmail({
      projectId: req.projectId,
      userEmail: req.currentUserEmail,
    });

    return {
      configs: await tx.configs
        .getAll({
          currentUserEmail: req.currentUserEmail,
          projectId: req.projectId,
        })
        .then(configs =>
          configs.map(config => ({
            ...config,
            myRole: myProjectRole
              ? combineConfigAndProjectRoles(myProjectRole.role, config.myRole)
              : config.myRole,
          })),
        ),
    };
  };
}
