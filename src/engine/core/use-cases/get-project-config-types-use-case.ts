import assert from 'assert';
import {InputData, JSONSchemaInput, quicktype} from 'quicktype-core';
import {BadRequestError} from '../errors';
import type {TransactionalUseCase} from '../use-case';
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

    return {
      types: `/**
 * Auto-generated TypeScript types for Replane configs
 *
 * Project: ${project.name}
 *
 * These types are generated from your config schemas and provide
 * full type safety when using the Replane SDK in your application.
 *
 * @generated This file is auto-generated. Do not edit manually.
 * Regenerate by updating your config schemas in the Replane dashboard.
 */

${result.lines.join('\n').trim()}`,
      configNames: schemas.map(schema => schema.name),
      exampleConfigName: exampleConfig.name,
    };
  };
}
