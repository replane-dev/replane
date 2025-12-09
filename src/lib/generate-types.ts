import {InputData, JSONSchemaInput, quicktype} from 'quicktype-core';

export interface ConfigSchema {
  name: string;
  schema: unknown | null;
}

export interface GeneratedTypes {
  /**
   * Generated requiredConfigs constant
   * Example: { "config-name": true, "another-config": true }
   */
  requiredConfigs: string;

  /**
   * Full TypeScript code including imports, interfaces, and constants
   */
  fullCode: string;
}

/**
 * Generates TypeScript types from config schemas using quicktype
 */
export async function generateTypesFromSchemas(params: {
  schemas: ConfigSchema[];
  withExports: boolean;
}): Promise<GeneratedTypes> {
  // Build a JSON Schema for the Configs interface
  const configsSchema = {
    $schema: 'http://json-schema.org/draft-07/schema#',
    type: 'object',
    properties: {} as Record<string, any>,
    required: [] as string[],
    additionalProperties: false,
  };

  for (const config of params.schemas) {
    if (config.schema !== null) {
      configsSchema.properties[config.name] = config.schema;
    } else {
      // No schema defined - use unknown type
      configsSchema.properties[config.name] = true;
    }
  }

  // Use quicktype to generate TypeScript types
  const schemaInput = new JSONSchemaInput(undefined);
  await schemaInput.addSource({
    name: 'Configs',
    schema: JSON.stringify(configsSchema),
  });

  const inputData = new InputData();
  inputData.addInput(schemaInput);

  const result = await quicktype({
    inputData,
    lang: 'typescript',
    rendererOptions: {
      'just-types': 'true',
      'prefer-unions': 'true',
      'prefer-const-values': 'true',
    },
  });

  const generatedCode = result.lines.join('\n');

  // Generate requiredConfigs constant
  const requiredConfigsObj = params.schemas.reduce(
    (acc, config) => {
      acc[config.name] = true;
      return acc;
    },
    {} as Record<string, boolean>,
  );
  const requiredConfigs = JSON.stringify(requiredConfigsObj, null, 2);

  // Build full code
  const fullCode = `${generatedCode.trim()}

// Mark all configs as required
// If a config is missing, the client will throw during initialization
const requiredConfigs: Record<keyof Configs, boolean> = ${requiredConfigs};

${params.withExports ? 'export { requiredConfigs, Configs };' : ''}`;

  return {
    requiredConfigs,
    fullCode,
  };
}
