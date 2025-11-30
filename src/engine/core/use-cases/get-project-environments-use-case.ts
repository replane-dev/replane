import type {TransactionalUseCase} from '../use-case';
import type {NormalizedEmail} from '../zod';

export interface GetProjectEnvironmentsRequest {
  projectId: string;
  currentUserEmail: NormalizedEmail;
}

export interface GetProjectEnvironmentsResponse {
  environments: Array<{
    id: string;
    name: string;
  }>;
}

export function createGetProjectEnvironmentsUseCase(): TransactionalUseCase<
  GetProjectEnvironmentsRequest,
  GetProjectEnvironmentsResponse
> {
  return async (ctx, tx, req) => {
    await tx.permissionService.ensureIsOrganizationMember(ctx, {
      projectId: req.projectId,
      currentUserEmail: req.currentUserEmail,
    });

    const environments = await tx.projectEnvironments.getByProjectId(req.projectId);

    return {
      environments: environments.map(env => ({
        id: env.id,
        name: env.name,
      })),
    };
  };
}
