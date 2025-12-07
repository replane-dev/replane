import type {Override} from '@/engine/core/override-evaluator';
import type {CreateConfigRequest} from '@/engine/core/use-cases/create-config-use-case';
import type {ConfigSchema, ConfigValue, NormalizedEmail} from '@/engine/core/zod';

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
  currentUserEmail: NormalizedEmail;
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
    currentUserEmail: params.currentUserEmail,
    editorEmails: params.editorEmails,
    maintainerEmails: params.maintainerEmails,
    projectId: params.projectId,
    environmentVariants: environments.map(env => ({
      environmentId: env.id,
      value: params.value,
      schema: params.schema,
      overrides: params.overrides,
      useDefaultSchema: false,
    })),
  };
}
