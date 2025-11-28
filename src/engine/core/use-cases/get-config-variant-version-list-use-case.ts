import {BadRequestError} from '../errors';
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
  return async (_ctx, tx, req) => {
    // Check permissions - viewing version history requires edit access
    await tx.permissionService.ensureCanEditConfig(req.configId, req.currentUserEmail);

    // Get the config to verify it exists and belongs to the project
    const config = await tx.configs.getById(req.configId);
    if (!config) {
      throw new Error('Config not found');
    }
    if (config.projectId !== req.projectId) {
      throw new Error('Config does not belong to the specified project');
    }

    // Get the variant for this config and environment
    const variant = await tx.configVariants.getByConfigIdAndEnvironmentId({
      configId: req.configId,
      environmentId: req.environmentId,
    });

    if (!variant) {
      throw new BadRequestError('Config variant not found for the specified environment');
    }

    const versions = await tx.configVariantVersions.getByConfigVariantIdWithAuthors(variant.id);

    return {
      versions: versions.map(v => ({
        id: v.id,
        version: v.version,
        description: v.description,
        createdAt: v.createdAt,
        authorEmail: v.authorEmail,
      })),
    };
  };
}
