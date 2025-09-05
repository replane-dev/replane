import type {UseCase} from '../use-case';
import type {ConfigInfo, NormalizedEmail} from '../zod';

export interface GetConfigListRequest {
  currentUserEmail: NormalizedEmail;
}

export interface GetConfigListResponse {
  configs: ConfigInfo[];
}

export interface GetConfigListUseCasesDeps {}

export function createGetConfigListUseCase(
  deps: GetConfigListUseCasesDeps,
): UseCase<GetConfigListRequest, GetConfigListResponse> {
  return async (ctx, tx, req) => {
    return {
      configs: await tx.configs.getAll({currentUserEmail: req.currentUserEmail}),
    };
  };
}
