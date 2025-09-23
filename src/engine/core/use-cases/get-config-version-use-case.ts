import type {TransactionalUseCase} from '../use-case';
import type {NormalizedEmail} from '../zod';

export interface GetConfigVersionRequest {
  name: string;
  version: number;
  currentUserEmail: NormalizedEmail;
  projectId: string;
}

export interface GetConfigVersionResponse {
  version:
    | {
        id: string;
        version: number;
        createdAt: Date;
        description: string;
        value: unknown;
        schema: unknown;
        authorEmail: string | null;
      }
    | undefined;
}

export interface GetConfigVersionUseCasesDeps {}

export function createGetConfigVersionUseCase(
  _deps: GetConfigVersionUseCasesDeps,
): TransactionalUseCase<GetConfigVersionRequest, GetConfigVersionResponse> {
  return async (_ctx, tx, req) => {
    const config = await tx.configs.getByName({name: req.name, projectId: req.projectId});
    if (!config) return {version: undefined};

    await tx.permissionService.ensureCanEditConfig(config.id, req.currentUserEmail);

    const version = await tx.configVersions.getByConfigIdAndVersion(config.id, req.version);
    if (!version) return {version: undefined};

    return {
      version: {
        id: version.id,
        version: version.version,
        createdAt: version.createdAt,
        description: version.description,
        value: version.value,
        schema: version.schema,
        authorEmail: version.authorEmail,
      },
    };
  };
}
