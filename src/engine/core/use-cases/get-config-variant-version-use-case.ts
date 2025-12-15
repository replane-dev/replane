import assert from 'assert';
import type {TransactionalUseCase} from '../use-case';
import type {NormalizedEmail} from '../zod';
import type {ConfigSnapshot} from './get-config-proposal-use-case';

export interface GetConfigVariantVersionRequest {
  configId: string;
  version: number;
  currentUserEmail: NormalizedEmail;
  projectId: string;
}

export interface GetConfigVariantVersionResponse {
  version: ConfigSnapshot | undefined;
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

    // Get the specific version for this config
    const configVersion = await tx.configVersions.getByConfigIdAndVersion(
      req.configId,
      req.version,
    );

    if (!configVersion) {
      return {version: undefined};
    }

    const environments = await tx.projectEnvironments.getByProjectId(config.projectId);

    const getEnvironmentName = (environmentId: string) => {
      const environment = environments.find(e => e.id === environmentId);
      assert(environment, 'Environment not found');
      return environment.name;
    };

    // Get author email if authorId exists
    let authorEmail: string | null = null;
    if (configVersion.authorId) {
      const author = await tx.users.getById(configVersion.authorId);
      authorEmail = author?.email ?? null;
    }

    return {
      version: {
        description: configVersion.description,
        value: configVersion.value,
        schema: configVersion.schema,
        overrides: configVersion.overrides,
        members: configVersion.members.map(m => ({email: m.email, role: m.role})),
        variants: configVersion.variants.map(v => ({
          environmentId: v.environmentId,
          environmentName: getEnvironmentName(v.environmentId),
          value: v.value,
          schema: v.schema,
          overrides: v.overrides,
        })),
        authorEmail,
      } satisfies ConfigSnapshot,
    };
  };
}
