import type {TransactionalUseCase} from '../use-case';
import type {NormalizedEmail} from '../zod';

export interface GetConfigVariantVersionListRequest {
  configId: string;
  environmentId: string;
  currentUserEmail: NormalizedEmail;
  projectId: string;
}

export interface ConfigVariantVersionInfo {
  id: string;
  version: number;
  description: string;
  createdAt: Date;
  authorEmail: string | null;
}

export interface GetConfigVariantVersionListResponse {
  versions: ConfigVariantVersionInfo[];
}

export function createGetConfigVariantVersionListUseCase(): TransactionalUseCase<
  GetConfigVariantVersionListRequest,
  GetConfigVariantVersionListResponse
> {
  return async (ctx, tx, req) => {
    // Check permissions - viewing version history requires edit access
    await tx.permissionService.ensureCanEditConfig(ctx, {
      configId: req.configId,
      currentUserEmail: req.currentUserEmail,
    });

    // Get the config to verify it exists and belongs to the project
    const config = await tx.configs.getById(req.configId);
    if (!config) {
      throw new Error('Config not found');
    }
    if (config.projectId !== req.projectId) {
      throw new Error('Config does not belong to the specified project');
    }

    const versions = await tx.configVersions.getByConfigId(req.configId);

    // Get unique author ids and fetch their emails
    const authorIds = [
      ...new Set(versions.map(v => v.authorId).filter((id): id is number => id !== null)),
    ];
    const authors = await tx.users.getByIds(authorIds);

    const authorEmails = new Map(authors.map(a => [a.id, a.email]));

    return {
      versions: versions.map(v => ({
        id: v.id,
        version: v.version,
        description: v.description,
        createdAt: v.createdAt,
        authorEmail: v.authorId ? (authorEmails.get(v.authorId) ?? null) : null,
      })),
    };
  };
}
