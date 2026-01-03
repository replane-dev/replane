import {BadRequestError} from '../errors';
import {getUserIdFromIdentity, type Identity} from '../identity';
import type {Override} from '../override-condition-schemas';
import {createConfigId, type ConfigId} from '../stores/config-store';
import type {TransactionalUseCase} from '../use-case';
import type {ConfigSchema, ConfigValue} from '../zod';

export interface CreateConfigRequest {
  name: string;
  description: string;
  identity: Identity;
  editorEmails: string[];
  maintainerEmails: string[];
  projectId: string;
  defaultVariant: {
    value: ConfigValue;
    schema: ConfigSchema | null;
    overrides: Override[];
  };
  environmentVariants: Array<{
    environmentId: string;
    value: ConfigValue;
    schema: ConfigSchema | null;
    overrides: Override[];
    useBaseSchema: boolean;
  }>;
}

export interface CreateConfigResponse {
  configId: ConfigId;
  configVariantIds: Array<{variantId: string; environmentId: string}>;
}

export interface CreateConfigUseCaseDeps {}

export function createCreateConfigUseCase(
  _deps: CreateConfigUseCaseDeps,
): TransactionalUseCase<CreateConfigRequest, CreateConfigResponse> {
  return async (ctx, tx, req) => {
    await tx.permissionService.ensureCanCreateConfig(ctx, {
      projectId: req.projectId,
      identity: req.identity,
    });

    const existingConfig = await tx.configs.getByName({
      name: req.name,
      projectId: req.projectId,
    });
    if (existingConfig) {
      throw new BadRequestError('Config with this name already exists');
    }

    const configId = createConfigId();

    // Use the config service to create the config with all related records
    const {variantIds} = await tx.configService.createConfig(ctx, {
      id: configId,
      name: req.name,
      projectId: req.projectId,
      description: req.description,
      defaultVariant: req.defaultVariant,
      environmentVariants: req.environmentVariants,
      members: [
        ...req.editorEmails.map(email => ({email, role: 'editor' as const})),
        ...req.maintainerEmails.map(email => ({email, role: 'maintainer' as const})),
      ],
      authorId: getUserIdFromIdentity(req.identity),
    });

    return {
      configId,
      configVariantIds: variantIds,
    };
  };
}
