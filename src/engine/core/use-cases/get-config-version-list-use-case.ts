import type {UseCase} from '../use-case';
import type {NormalizedEmail} from '../zod';

export interface GetConfigVersionListRequest {
  name: string;
  currentUserEmail: NormalizedEmail;
  projectId: string;
}

export interface GetConfigVersionListResponse {
  versions:
    | Array<{
        id: string;
        version: number;
        createdAt: Date;
        description: string;
        authorEmail: string | null;
      }>
    | undefined; // undefined when config not found
}

export interface GetConfigVersionListUseCasesDeps {}

export function createGetConfigVersionListUseCase(
  _deps: GetConfigVersionListUseCasesDeps,
): UseCase<GetConfigVersionListRequest, GetConfigVersionListResponse> {
  return async (_ctx, tx, req) => {
    const config = await tx.configs.getByName({
      name: req.name,
      projectId: req.projectId,
    });
    if (!config) {
      return {versions: undefined};
    }
    const versions = await tx.configVersions.listByConfigId(config.id);
    return {
      versions: versions.map(v => ({
        id: v.id,
        version: v.version,
        createdAt: v.createdAt,
        description: v.description,
        authorEmail: v.authorEmail,
      })),
    };
  };
}
