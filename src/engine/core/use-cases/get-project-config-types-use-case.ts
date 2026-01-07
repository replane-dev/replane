import assert from 'assert';
import {spawn} from 'child_process';
import {mkdtemp, readFile, rm, writeFile} from 'fs/promises';
import {tmpdir} from 'os';
import {join} from 'path';
import {InputData, JSONSchemaInput, quicktype} from 'quicktype-core';
import {BadRequestError} from '../errors';
import type {Identity} from '../identity';
import type {TransactionalUseCase} from '../use-case';
import {trimEnd} from '../utils';

export type CodegenLanguage = 'typescript' | 'python' | 'csharp';

export interface GetProjectConfigTypesRequest {
  projectId: string;
  environmentId: string;
  identity: Identity;
  language?: CodegenLanguage;
}

export interface GetProjectConfigTypesResponse {
  configNames: string[];
  exampleConfigName: string;
  types: string;
  language: CodegenLanguage;
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
 * Language-specific configuration for quicktype.
 */
interface LanguageConfig {
  lang: 'typescript' | 'python' | 'csharp';
  rendererOptions: Record<string, string>;
  commentPrefix: string;
  commentSuffix: string;
}

const LANGUAGE_CONFIGS: Record<CodegenLanguage, LanguageConfig> = {
  typescript: {
    lang: 'typescript',
    rendererOptions: {
      'just-types': 'true',
      'prefer-unions': 'true',
      'prefer-const-values': 'true',
    },
    commentPrefix: '/**\n',
    commentSuffix: '\n */',
  },
  python: {
    lang: 'python',
    rendererOptions: {},
    commentPrefix: '"""\n',
    commentSuffix: '\n"""',
  },
  csharp: {
    lang: 'csharp',
    rendererOptions: {
      namespace: 'Replane.Generated',
      framework: 'SystemTextJson',
      'check-required': 'true',
    },
    commentPrefix: '/**\n',
    commentSuffix: '\n */',
  },
};

/**
 * Generates Python types using jsonschema-gentypes.
 * Uses TypedDict output for type-safe dictionary definitions.
 * jsonschema-gentypes only works with files, so we use temp files for input/output.
 */
async function generatePythonTypes(schema: Record<string, any>): Promise<string> {
  // Create a temp directory for our files
  const tempDir = await mkdtemp(join(tmpdir(), 'replane-types-'));
  const schemaPath = join(tempDir, 'schema.json');
  const outputPath = join(tempDir, 'models.py');

  try {
    // Write the schema to a temp file
    await writeFile(
      schemaPath,
      JSON.stringify(
        {
          title: 'Configs',
          ...schema,
        },
        null,
        2,
      ),
    );

    // Run jsonschema-gentypes
    await new Promise<void>((resolve, reject) => {
      const proc = spawn('jsonschema-gentypes', [
        '--json-schema',
        schemaPath,
        '--python',
        outputPath,
      ]);

      let stderr = '';

      proc.stderr.on('data', (data: Buffer) => {
        stderr += data.toString();
      });

      proc.on('close', (code: number | null) => {
        if (code === 0) {
          resolve();
        } else {
          reject(
            new Error(`jsonschema-gentypes failed with code ${code}: ${stderr || 'Unknown error'}`),
          );
        }
      });

      proc.on('error', (err: Error) => {
        reject(new Error(`Failed to spawn jsonschema-gentypes: ${err.message}`));
      });
    });

    // Read the generated output
    const output = await readFile(outputPath, 'utf-8');

    // Remove any auto-generated header as we'll add our own
    const lines = output.split('\n');
    const contentStartIndex = lines.findIndex(
      line => line.startsWith('from __future__') || line.startsWith('from typing'),
    );
    const content = contentStartIndex >= 0 ? lines.slice(contentStartIndex).join('\n') : output;

    return content.trim();
  } finally {
    // Clean up temp files
    await rm(tempDir, {recursive: true, force: true});
  }
}

/**
 * Generates the header comment for the types file.
 */
function generateTypesHeader(params: {
  workspaceName: string;
  projectName: string;
  environmentName: string;
  codegenUrl: string;
  language: CodegenLanguage;
}): string {
  const config = LANGUAGE_CONFIGS[params.language];
  const linePrefix = params.language === 'python' ? '' : ' * ';

  const content = [
    `${linePrefix}Auto-generated types for Replane configuration`,
    `${linePrefix}`,
    `${linePrefix}Workspace:   ${params.workspaceName}`,
    `${linePrefix}Project:     ${params.projectName}`,
    `${linePrefix}Environment: ${params.environmentName}`,
    `${linePrefix}`,
    `${linePrefix}These types are automatically generated from your config schemas.`,
    `${linePrefix}Regenerate them whenever you update your schema definitions.`,
    `${linePrefix}`,
    `${linePrefix}@link ${params.codegenUrl}`,
  ].join('\n');

  return `${config.commentPrefix}${content}${config.commentSuffix}`;
}

export interface GetProjectConfigTypesUseCaseOptions {
  baseUrl: string;
}

export function createGetProjectConfigTypesUseCase(
  options: GetProjectConfigTypesUseCaseOptions,
): TransactionalUseCase<GetProjectConfigTypesRequest, GetProjectConfigTypesResponse> {
  return async (ctx, tx, req) => {
    const language = req.language ?? 'typescript';

    // Ensure user has access to the project
    await tx.permissionService.ensureIsWorkspaceMember(ctx, {
      projectId: req.projectId,
      identity: req.identity,
    });

    const project = await tx.projects.getByIdWithoutPermissionCheck(req.projectId);

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

    // Generate types based on language
    let generatedTypes: string;

    if (language === 'python') {
      // Use jsonschema-gentypes for Python
      generatedTypes = await generatePythonTypes(configsSchema);
    } else {
      // Use quicktype for TypeScript and C#
      const langConfig = LANGUAGE_CONFIGS[language];

      const schemaInput = new JSONSchemaInput(undefined);
      await schemaInput.addSource({
        name: 'Configs',
        schema: JSON.stringify(configsSchema),
      });

      const inputData = new InputData();
      inputData.addInput(schemaInput);

      const result = await quicktype({
        inputData,
        lang: langConfig.lang,
        rendererOptions: langConfig.rendererOptions,
      });

      generatedTypes = result.lines.join('\n').trim();
    }

    const projectEnvironment = await tx.projectEnvironments.getById({
      environmentId: req.environmentId,
      projectId: req.projectId,
    });

    if (!projectEnvironment) {
      throw new BadRequestError('Project environment not found');
    }

    const workspace = await tx.workspaces.getByIdSimple(project.workspaceId);

    if (!workspace) {
      throw new BadRequestError('Workspace not found');
    }

    const codegenUrl = `${trimEnd(options.baseUrl, '/')}/app/projects/${project.id}/configs?codegen`;

    const header = generateTypesHeader({
      workspaceName: workspace.name,
      projectName: project.name,
      environmentName: projectEnvironment.name,
      codegenUrl,
      language,
    });

    return {
      types: `${header}\n\n${generatedTypes}`,
      configNames: schemas.map(schema => schema.name),
      exampleConfigName: exampleConfig.name,
      language,
    };
  };
}
