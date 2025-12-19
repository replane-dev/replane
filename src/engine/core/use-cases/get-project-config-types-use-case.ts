import assert from 'assert';
import {InputData, JSONSchemaInput, quicktype} from 'quicktype-core';
import {BadRequestError} from '../errors';
import type {TransactionalUseCase} from '../use-case';
import {trimEnd} from '../utils';
import type {NormalizedEmail} from '../zod';

export interface GetProjectConfigTypesRequest {
  projectId: string;
  environmentId: string;
  currentUserEmail: NormalizedEmail;
}

export interface GetProjectConfigTypesResponse {
  configNames: string[];
  exampleConfigName: string;
  types: string;
}

interface ConfigSchema {
  name: string;
  schema: Record<string, any> | null;
}

/**
 * Recursively rewrites $ref paths in a JSON Schema object to use prefixed definition names.
 */
function rewriteSchemaRefs(obj: any, configName: string): any {
  if (typeof obj !== 'object' || obj === null) return obj;

  if (Array.isArray(obj)) {
    return obj.map(item => rewriteSchemaRefs(item, configName));
  }

  const result: Record<string, any> = {};
  for (const [key, value] of Object.entries(obj)) {
    if (key === '$ref' && typeof value === 'string') {
      // Rewrite references from #/$defs/X or #/definitions/X to #/$defs/ConfigName_X
      const match = value.match(/^#\/(\$defs|definitions)\/(.+)$/);
      if (match) {
        result[key] = `#/$defs/${configName}_${match[2]}`;
      } else {
        result[key] = value;
      }
    } else {
      result[key] = rewriteSchemaRefs(value, configName);
    }
  }
  return result;
}

/**
 * Extracts definitions from a config schema and merges them into the combined schema's $defs.
 * Returns the processed config schema with rewritten $ref paths.
 */
function processConfigSchema(
  config: ConfigSchema,
  combinedDefs: Record<string, any>,
): Record<string, any> | true {
  if (config.schema === null) {
    // No schema defined - use unknown type
    return true;
  }

  const schema = config.schema;
  const defs = schema.$defs || schema.definitions;

  if (!defs || typeof defs !== 'object') {
    // No definitions to process, return schema as-is
    return schema;
  }

  // Merge definitions into the combined $defs with prefixed names to avoid collisions
  for (const [defName, defSchema] of Object.entries(defs)) {
    const prefixedName = `${config.name}_${defName}`;
    combinedDefs[prefixedName] = defSchema;
  }

  // Clone the schema and remove the nested definitions
  const schemaClone = JSON.parse(JSON.stringify(schema));
  delete schemaClone.$defs;
  delete schemaClone.definitions;

  // Rewrite $ref paths to point to the prefixed definitions at the root level
  return rewriteSchemaRefs(schemaClone, config.name);
}

/**
 * Builds a combined JSON Schema from multiple config schemas.
 * Handles merging of $defs and rewriting of $ref paths.
 */
function buildCombinedConfigsSchema(schemas: ConfigSchema[]): Record<string, any> {
  const configsSchema: Record<string, any> = {
    $schema: 'http://json-schema.org/draft-07/schema#',
    type: 'object',
    properties: {},
    required: [],
    additionalProperties: false,
    $defs: {},
  };

  for (const config of schemas) {
    configsSchema.properties[config.name] = processConfigSchema(config, configsSchema.$defs);
    configsSchema.required.push(config.name);
  }

  // Remove $defs if empty
  if (Object.keys(configsSchema.$defs).length === 0) {
    delete configsSchema.$defs;
  }

  return configsSchema;
}

/**
 * Generates the header comment for the TypeScript types file.
 */
function generateTypesHeader(params: {
  workspaceName: string;
  projectName: string;
  environmentName: string;
  codegenUrl: string;
}): string {
  return `/**
 * Auto-generated types for Replane configuration
 *
 * Workspace:   ${params.workspaceName}
 * Project:     ${params.projectName}
 * Environment: ${params.environmentName}
 *
 * These types are automatically generated from your config schemas.
 * Regenerate them whenever you update your schema definitions.
 *
 * @link ${params.codegenUrl}
 */`;
}

export interface GetProjectConfigTypesUseCaseOptions {
  baseUrl: string;
}

export function createGetProjectConfigTypesUseCase(
  options: GetProjectConfigTypesUseCaseOptions,
): TransactionalUseCase<GetProjectConfigTypesRequest, GetProjectConfigTypesResponse> {
  return async (ctx, tx, req) => {
    // Ensure user has access to the project
    await tx.permissionService.ensureIsWorkspaceMember(ctx, {
      projectId: req.projectId,
      currentUserEmail: req.currentUserEmail,
    });

    const project = await tx.projects.getById({
      id: req.projectId,
      currentUserEmail: req.currentUserEmail,
    });

    if (!project) {
      throw new BadRequestError('Project not found');
    }

    // Query configs with their schemas for the specified environment
    const projectSchemas = await tx.configs.getConfigSchemas({
      projectId: req.projectId,
      environmentId: req.environmentId,
    });

    const exampleConfigSchema = {
      $schema: 'http://json-schema.org/draft-07/schema#',
      type: 'object',
      properties: {
        exampleProperty: {
          type: 'string',
        },
      },
      required: ['exampleProperty'],
      additionalProperties: false,
    };

    const schemas =
      projectSchemas.length > 0
        ? projectSchemas
        : [{name: 'ExampleConfig', schema: exampleConfigSchema}];

    const exampleConfig = schemas.at(0);
    assert(exampleConfig, 'No config schema found');

    // Build a combined JSON Schema for all configs
    const configsSchema = buildCombinedConfigsSchema(
      schemas as Array<{name: string; schema: Record<string, any> | null}>,
    );

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

    const projectEnvironment = await tx.projectEnvironments.getById({
      environmentId: req.environmentId,
      projectId: req.projectId,
    });

    if (!projectEnvironment) {
      throw new BadRequestError('Project environment not found');
    }

    const workspace = await tx.workspaces.getById({
      id: project.workspaceId,
      currentUserEmail: req.currentUserEmail,
    });

    if (!workspace) {
      throw new BadRequestError('Workspace not found');
    }

    const codegenUrl = `${trimEnd(options.baseUrl, '/')}/app/projects/${project.id}/configs?codegen`;

    const header = generateTypesHeader({
      workspaceName: workspace.name,
      projectName: project.name,
      environmentName: projectEnvironment.name,
      codegenUrl,
    });

    return {
      types: `${header}\n\n${result.lines.join('\n').trim()}`,
      configNames: schemas.map(schema => schema.name),
      exampleConfigName: exampleConfig.name,
    };
  };
}
