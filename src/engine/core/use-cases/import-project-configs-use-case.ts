import {BadRequestError} from '../errors';
import {getUserIdFromIdentity, type Identity} from '../identity';
import type {Override} from '../override-evaluator';
import {createConfigId} from '../stores/config-store';
import type {TransactionalUseCase} from '../use-case';
import type {ConfigSchema, ConfigValue} from '../zod';

export interface ImportedConfigVariant {
  environmentName: string;
  value: ConfigValue;
  schema: ConfigSchema | null;
  useBaseSchema: boolean;
  overrides: Override[];
}

export interface ImportedConfig {
  name: string;
  description: string;
  value: ConfigValue;
  schema: ConfigSchema | null;
  overrides: Override[];
  variants: ImportedConfigVariant[];
}

export interface EnvironmentMapping {
  sourceEnvironmentName: string;
  targetEnvironmentId: string;
}

export interface ImportProjectConfigsRequest {
  identity: Identity;
  projectId: string;
  configs: ImportedConfig[];
  environmentMappings: EnvironmentMapping[];
  /** What to do when a config with the same name already exists */
  onConflict: 'skip' | 'replace';
}

export interface ImportedConfigResult {
  name: string;
  status: 'created' | 'skipped' | 'replaced';
}

export interface ImportProjectConfigsResponse {
  results: ImportedConfigResult[];
  totalCreated: number;
  totalSkipped: number;
  totalReplaced: number;
}

export function createImportProjectConfigsUseCase(): TransactionalUseCase<
  ImportProjectConfigsRequest,
  ImportProjectConfigsResponse
> {
  return async (ctx, tx, req) => {
    // Ensure user can create configs in this project
    await tx.permissionService.ensureCanCreateConfig(ctx, {
      projectId: req.projectId,
      identity: req.identity,
    });

    // Check if project requires approvals - import bypasses the approval workflow
    const project = await tx.projects.getByIdWithoutPermissionCheck(req.projectId);
    if (!project) {
      throw new BadRequestError('Project not found');
    }
    if (project.requireProposals) {
      throw new BadRequestError(
        'Cannot import configs when review is required. Disable "Require review" in project settings to import configs.',
      );
    }

    // Get all environments for this project
    const environments = await tx.projectEnvironments.getByProjectId(req.projectId);
    if (environments.length === 0) {
      throw new BadRequestError('Project has no environments. Create an environment first.');
    }

    // Check if replacement would bypass review requirements
    // When onConflict is 'replace', we're deleting and recreating configs which bypasses the proposal workflow
    if (req.onConflict === 'replace') {
      const envsRequiringReview = environments.filter(e => e.requireProposals);
      if (envsRequiringReview.length > 0) {
        const envNames = envsRequiringReview.map(e => e.name).join(', ');
        throw new BadRequestError(
          `Cannot replace configs when environments require review: ${envNames}. Use "skip" conflict mode or disable review requirements for these environments.`,
        );
      }
    }

    // Build environment mapping lookup
    const envMappingLookup = new Map<string, string>();
    for (const mapping of req.environmentMappings) {
      // Validate target environment exists
      const targetEnv = environments.find(e => e.id === mapping.targetEnvironmentId);
      if (!targetEnv) {
        throw new BadRequestError(`Target environment not found: ${mapping.targetEnvironmentId}`);
      }
      envMappingLookup.set(mapping.sourceEnvironmentName, mapping.targetEnvironmentId);
    }

    const results: ImportedConfigResult[] = [];
    let totalCreated = 0;
    let totalSkipped = 0;
    let totalReplaced = 0;

    for (const importedConfig of req.configs) {
      // Check if config already exists
      const existingConfig = await tx.configs.getByName({
        name: importedConfig.name,
        projectId: req.projectId,
      });

      if (existingConfig) {
        if (req.onConflict === 'skip') {
          results.push({name: importedConfig.name, status: 'skipped'});
          totalSkipped++;
          continue;
        }
        // For 'replace', delete existing config first
        await tx.configService.deleteConfig(ctx, {
          configId: existingConfig.id,
          identity: req.identity,
          prevVersion: existingConfig.version,
        });
        results.push({name: importedConfig.name, status: 'replaced'});
        totalReplaced++;
      } else {
        results.push({name: importedConfig.name, status: 'created'});
        totalCreated++;
      }

      // Build environment variants from mapped environments
      const environmentVariants: Array<{
        environmentId: string;
        value: ConfigValue;
        schema: ConfigSchema | null;
        overrides: Override[];
        useBaseSchema: boolean;
      }> = [];

      for (const variant of importedConfig.variants) {
        const targetEnvId = envMappingLookup.get(variant.environmentName);
        if (targetEnvId) {
          // Check if we already have a variant for this target environment
          // (in case multiple source envs map to the same target)
          const existingVariantIndex = environmentVariants.findIndex(
            v => v.environmentId === targetEnvId,
          );
          if (existingVariantIndex === -1) {
            environmentVariants.push({
              environmentId: targetEnvId,
              value: variant.value,
              schema: variant.schema,
              overrides: variant.overrides,
              useBaseSchema: variant.useBaseSchema,
            });
          }
          // If mapping already exists, skip duplicate (first one wins)
        }
      }

      const configId = createConfigId();

      // Create the config with all related records
      await tx.configService.createConfig(ctx, {
        id: configId,
        name: importedConfig.name,
        projectId: req.projectId,
        description: importedConfig.description,
        defaultVariant: {
          value: importedConfig.value,
          schema: importedConfig.schema,
          overrides: importedConfig.overrides,
        },
        environmentVariants,
        members: [], // No special permissions for imported configs
        authorId: getUserIdFromIdentity(req.identity),
      });
    }

    return {
      results,
      totalCreated,
      totalSkipped,
      totalReplaced,
    };
  };
}
