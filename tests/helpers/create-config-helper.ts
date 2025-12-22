import type {Identity} from '@/engine/core/identity';
import type {Override} from '@/engine/core/override-evaluator';
import type {CreateConfigRequest} from '@/engine/core/use-cases/create-config-use-case';
import type {ConfigSchema, ConfigValue} from '@/engine/core/zod';

/**
 * Helper to convert old-style createConfig calls to new API format
 *
 * Old API: { value, schema, overrides, ... }
 * New API: { environmentVariants: [{environmentId, value, schema, overrides}], defaultVariant?: {...}, ... }
 */
export interface LegacyCreateConfigParams {
  name: string;
  value: ConfigValue;
  schema: ConfigSchema | null;
  overrides: Override[];
  description: string;
  identity: Identity;
  editorEmails: string[];
  maintainerEmails: string[];
  projectId: string;
}

/**
 * Converts old-style params to new CreateConfigRequest format
 */
export function convertLegacyCreateConfigParams(
  params: LegacyCreateConfigParams,
  environments: Array<{id: string}>,
): CreateConfigRequest {
  return {
    name: params.name,
    description: params.description,
    identity: params.identity,
    editorEmails: params.editorEmails,
    maintainerEmails: params.maintainerEmails,
    projectId: params.projectId,
    // Default variant (base config) stored in configs table
    defaultVariant: {
      value: params.value,
      schema: params.schema,
      overrides: params.overrides,
    },
    // Environment variants use the same values with useDefaultSchema
    environmentVariants: environments.map(env => ({
      environmentId: env.id,
      value: params.value,
      schema: params.schema,
      overrides: params.overrides,
      useDefaultSchema: true,
    })),
  };
}
