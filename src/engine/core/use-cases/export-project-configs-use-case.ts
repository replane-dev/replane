import type {Identity} from '../identity';
import type {Override} from '../override-evaluator';
import type {TransactionalUseCase} from '../use-case';
import type {ConfigSchema, ConfigValue} from '../zod';

export interface ExportProjectConfigsRequest {
  identity: Identity;
  projectId: string;
}

export interface ExportedConfigVariant {
  environmentName: string;
  value: ConfigValue;
  schema: ConfigSchema | null;
  useBaseSchema: boolean;
  overrides: Override[];
}

export interface ExportedConfig {
  name: string;
  description: string;
  value: ConfigValue;
  schema: ConfigSchema | null;
  overrides: Override[];
  variants: ExportedConfigVariant[];
}

export interface ExportProjectConfigsResponse {
  projectName: string;
  exportedAt: string;
  configs: ExportedConfig[];
}

export function createExportProjectConfigsUseCase(): TransactionalUseCase<
  ExportProjectConfigsRequest,
  ExportProjectConfigsResponse
> {
  return async (ctx, tx, req) => {
    // Ensure user can read configs in this project
    await tx.permissionService.ensureCanReadConfigs(ctx, {
      projectId: req.projectId,
      identity: req.identity,
    });

    // Get project info
    const project = await tx.projects.getByIdWithoutPermissionCheck(req.projectId);
    if (!project) {
      throw new Error('Project not found');
    }

    // Get all configs for the project
    const configRows = await tx.db
      .selectFrom('configs')
      .selectAll()
      .where('project_id', '=', req.projectId)
      .orderBy('name')
      .execute();

    // For each config, get its variants
    const configs: ExportedConfig[] = [];
    for (const configRow of configRows) {
      const variants = await tx.configVariants.getByConfigId({
        configId: configRow.id,
        projectId: req.projectId,
      });

      configs.push({
        name: configRow.name,
        description: configRow.description,
        value: JSON.parse(configRow.value),
        schema: configRow.schema ? JSON.parse(configRow.schema) : null,
        overrides: JSON.parse(configRow.overrides) ?? [],
        variants: variants.map(v => ({
          environmentName: v.environmentName,
          value: v.value,
          schema: v.schema,
          useBaseSchema: v.useBaseSchema,
          overrides: v.overrides,
        })),
      });
    }

    return {
      projectName: project.name,
      exportedAt: new Date().toISOString(),
      configs,
    };
  };
}
