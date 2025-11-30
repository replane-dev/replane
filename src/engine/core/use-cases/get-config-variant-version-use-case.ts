import {BadRequestError} from '../errors';
import type {TransactionalUseCase} from '../use-case';
import type {NormalizedEmail} from '../zod';

export interface GetConfigVariantVersionRequest {
  configId: string;
  environmentId: string;
  version: number;
  currentUserEmail: NormalizedEmail;
  projectId: string;
}

export interface GetConfigVariantVersionResponse {
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

export function createGetConfigVariantVersionUseCase(): TransactionalUseCase<
  GetConfigVariantVersionRequest,
  GetConfigVariantVersionResponse
> {
  return async (ctx, tx, req) => {
    // Check permissions - viewing version details requires edit access
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

    // Get the variant for this config and environment
    const variant = await tx.configVariants.getByConfigIdAndEnvironmentId({
      configId: req.configId,
      environmentId: req.environmentId,
    });

    if (!variant) {
      throw new BadRequestError('Config variant not found for the specified environment');
    }

    // Get the specific version with author email in a single query
    const version = await tx.configVariantVersions.getByConfigVariantIdAndVersionWithAuthor({
      configVariantId: variant.id,
      version: req.version,
    });

    if (!version) {
      return {version: undefined};
    }

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
