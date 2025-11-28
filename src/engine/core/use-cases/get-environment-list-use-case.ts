import type {ProjectEnvironment} from '../project-environment-store';
import type {TransactionalUseCase} from '../use-case';
import type {NormalizedEmail} from '../zod';

export interface GetEnvironmentListRequest {
  projectId: string;
  currentUserEmail: NormalizedEmail;
}

export interface GetEnvironmentListResponse {
  environments: ProjectEnvironment[];
}

export interface GetEnvironmentListUseCaseDeps {}

export function createGetEnvironmentListUseCase({}: GetEnvironmentListUseCaseDeps): TransactionalUseCase<
  GetEnvironmentListRequest,
  GetEnvironmentListResponse
> {
  return async (ctx, tx, req) => {
    const environments = await tx.projectEnvironments.getByProjectId(req.projectId);

    return {
      environments,
    };
  };
}
