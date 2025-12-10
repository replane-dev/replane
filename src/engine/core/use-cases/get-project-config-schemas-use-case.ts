import type {TransactionalUseCase} from '../use-case';
import type {NormalizedEmail} from '../zod';

export interface GetProjectConfigSchemasRequest {
  projectId: string;
  environmentId: string;
  currentUserEmail: NormalizedEmail;
}

export interface ConfigSchema {
  name: string;
  schema: unknown | null;
}

export interface GetProjectConfigSchemasResponse {
  schemas: ConfigSchema[];
}

export function createGetProjectConfigSchemasUseCase(): TransactionalUseCase<
  GetProjectConfigSchemasRequest,
  GetProjectConfigSchemasResponse
> {
  return async (ctx, tx, req) => {
    // Ensure user has access to the project
    await tx.permissionService.ensureIsWorkspaceMember(ctx, {
      projectId: req.projectId,
      currentUserEmail: req.currentUserEmail,
    });

    // Query configs with their schemas for the specified environment
    const schemas = await tx.configs.getConfigSchemas({
      projectId: req.projectId,
      environmentId: req.environmentId,
    });

    return {schemas};
  };
}
