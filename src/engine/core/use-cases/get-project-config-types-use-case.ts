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
  origin: string;
}

export interface GetProjectConfigTypesResponse {
  configNames: string[];
  exampleConfigName: string;
  types: string;
}

export function createGetProjectConfigTypesUseCase(): TransactionalUseCase<
  GetProjectConfigTypesRequest,
  GetProjectConfigTypesResponse
> {
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

    // Build a JSON Schema for the Configs interface
    const configsSchema = {
      $schema: 'http://json-schema.org/draft-07/schema#',
      type: 'object',
      properties: {} as Record<string, any>,
      required: [] as string[],
      additionalProperties: false,
    };

    for (const config of schemas) {
      if (config.schema !== null) {
        configsSchema.properties[config.name] = config.schema;
      } else {
        // No schema defined - use unknown type
        configsSchema.properties[config.name] = true;
      }

      configsSchema.required.push(config.name);
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

    const projectEnvironment = await tx.projectEnvironments.getById({
      environmentId: req.environmentId,
      projectId: req.projectId,
    });

    if (!projectEnvironment) {
      throw new BadRequestError('Project environment not found');
    }

    const codegenUrl = `${trimEnd(req.origin, '/')}/app/projects/${project.id}/configs?codegen`;

    const workspace = await tx.workspaces.getById({
      id: project.workspaceId,
      currentUserEmail: req.currentUserEmail,
    });

    if (!workspace) {
      throw new BadRequestError('Workspace not found');
    }

    return {
      types: `/**
 * Auto-generated types for Replane configuration
 *
 * Workspace:   ${workspace.name}
 * Project:     ${project.name}
 * Environment: ${projectEnvironment.name}
 *
 * These types are automatically generated from your config schemas.
 * Regenerate them whenever you update your schema definitions.
 *
 * @link ${codegenUrl}
 */

${result.lines.join('\n').trim()}`,
      configNames: schemas.map(schema => schema.name),
      exampleConfigName: exampleConfig.name,
    };
  };
}
