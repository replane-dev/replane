import type {ConfigService} from '../config-service';
import type {Context} from '../context';
import {isUserIdentity, type Identity} from '../identity';
import type {Override} from '../override-condition-schemas';
import {ConfigStore, createConfigId} from '../stores/config-store';
import type {ProjectEnvironmentStore} from '../stores/project-environment-store';
import type {TransactionalUseCase} from '../use-case';
import {stringifyJsonc} from '../utils';
import {ConfigSchema, type ConfigValue} from '../zod';

export interface AddExampleConfigsRequest {
  projectId: string;
  identity: Identity;
}

export interface AddExampleConfigsResponse {
  addedConfigsCount: number;
}

export function createAddExampleConfigsUseCase(): TransactionalUseCase<
  AddExampleConfigsRequest,
  AddExampleConfigsResponse
> {
  return async (ctx, tx, req) => {
    if (!isUserIdentity(req.identity)) {
      throw new Error('Add example configs requires a user identity');
    }
    // Verify permission to create configs in this project
    await tx.permissionService.ensureCanCreateConfig(ctx, {
      projectId: req.projectId,
      identity: req.identity,
    });

    const {addedConfigsCount} = await createExampleConfigs({
      ctx,
      projectId: req.projectId,
      configs: tx.configs,
      configService: tx.configService,
      projectEnvironments: tx.projectEnvironments,
      userId: req.identity.user.id,
    });

    return {addedConfigsCount};
  };
}

export async function createExampleConfigs(params: {
  ctx: Context;
  projectId: string;
  configs: ConfigStore;
  configService: ConfigService;
  projectEnvironments: ProjectEnvironmentStore;
  userId: number | null;
}) {
  const {ctx, projectId, configs, configService, projectEnvironments, userId} = params;

  // Get project environments
  const environments = await projectEnvironments.getByProjectId(projectId);
  const productionEnv = environments.find(e => e.name.toLowerCase() === 'production');
  const developmentEnv = environments.find(e => e.name.toLowerCase() === 'development');

  const productionId = productionEnv?.id ?? environments[0]?.id ?? '';
  const developmentId = developmentEnv?.id ?? environments[1]?.id ?? environments[0]?.id ?? '';

  // Get example configs
  const exampleConfigs = getExampleConfigs({productionId, developmentId});

  let addedCount = 0;

  for (const config of exampleConfigs) {
    // Check if config with this name already exists
    const existingConfig = await configs.getByName({
      name: config.name,
      projectId: projectId,
    });

    if (existingConfig) {
      // Skip configs that already exist
      continue;
    }

    const configId = createConfigId();

    // Use the config service to create the config with all related records
    await configService.createConfig(ctx, {
      id: configId,
      name: config.name,
      projectId: projectId,
      description: config.description,
      defaultVariant: {
        value: config.value,
        schema: config.schema,
        overrides: config.overrides,
      },
      environmentVariants: config.variants.map(v => ({
        environmentId: v.environmentId,
        value: v.value,
        schema: v.schema,
        overrides: v.overrides,
        useBaseSchema: v.useBaseSchema,
      })),
      members: [],
      authorId: userId,
    });

    addedCount++;
  }

  return {addedConfigsCount: addedCount};
}

interface ExampleConfig {
  name: string;
  schema: ConfigSchema;
  value: ConfigValue;
  overrides: Override[];
  description: string;
  variants: Array<{
    environmentId: string;
    value: ConfigValue;
    schema: ConfigSchema | null;
    overrides: Override[];
    useBaseSchema: boolean;
  }>;
}

function getExampleConfigs(params: {productionId: string; developmentId: string}): ExampleConfig[] {
  const {productionId, developmentId} = params;

  // We want to onboard the user with a few example configs
  // Those configs should progressively demonstrate the different features of the config service
  // Configs are ordered by name in user interface, so we want to define
  // configs with names in alphabetical order where complexity of a config feature increases
  // with its name alphabetically

  return [
    // 1 - Simple boolean feature flag (simplest config type)
    {
      name: 'example-1-feature-flag',
      description: 'A simple feature flag to enable/disable a feature',
      schema: stringifyJsonc({
        $schema: 'http://json-schema.org/draft-07/schema#',
        type: 'boolean',
      }) as ConfigSchema,
      value: stringifyJsonc(true) as ConfigValue,
      overrides: [],
      variants: [],
    },

    // 2 - Object config with JSON Schema (demonstrates schema validation)
    {
      name: 'example-2-app-settings',
      description: 'Application settings with JSON Schema validation',
      schema: stringifyJsonc({
        $schema: 'http://json-schema.org/draft-07/schema#',
        type: 'object',
        properties: {
          maxUploadSizeMb: {type: 'number', minimum: 1, maximum: 100},
          allowedFileTypes: {type: 'array', items: {type: 'string'}},
          maintenanceMode: {type: 'boolean'},
        },
        required: ['maxUploadSizeMb', 'allowedFileTypes', 'maintenanceMode'],
        additionalProperties: false,
      }) as ConfigSchema,
      value: stringifyJsonc({
        maxUploadSizeMb: 10,
        allowedFileTypes: ['jpg', 'png', 'pdf'],
        maintenanceMode: false,
      }) as ConfigValue,
      overrides: [],
      variants: [],
    },

    // 3 - Config with property-based override (demonstrates conditional targeting)
    {
      name: 'example-3-user-access',
      description: 'User access level with conditional overrides based on user properties',
      schema: stringifyJsonc({
        $schema: 'http://json-schema.org/draft-07/schema#',
        type: 'string',
        enum: ['basic', 'premium', 'enterprise'],
      }) as ConfigSchema,
      value: stringifyJsonc('basic') as ConfigValue,
      overrides: [
        {
          name: 'Premium users',
          conditions: [
            {
              operator: 'equals',
              property: 'subscription',
              value: {type: 'literal', value: 'premium'},
            },
          ],
          value: stringifyJsonc('premium') as ConfigValue,
        },
        {
          name: 'Enterprise users',
          conditions: [
            {
              operator: 'in',
              property: 'organization',
              value: {
                type: 'literal',
                value: ['acme-corp', 'globex', 'initech'],
              },
            },
          ],
          value: stringifyJsonc('enterprise') as ConfigValue,
        },
      ],
      variants: [],
    },

    // 4 - Config with comparison operators (demonstrates numeric conditions)
    {
      name: 'example-4-rate-limits',
      description: 'API rate limits based on user tier and usage',
      schema: stringifyJsonc({
        $schema: 'http://json-schema.org/draft-07/schema#',
        type: 'object',
        properties: {
          requestsPerMinute: {type: 'number'},
          burstLimit: {type: 'number'},
        },
        required: ['requestsPerMinute', 'burstLimit'],
        additionalProperties: false,
      }) as ConfigSchema,
      value: stringifyJsonc({
        requestsPerMinute: 60,
        burstLimit: 10,
      }) as ConfigValue,
      overrides: [
        {
          name: 'High volume users',
          conditions: [
            {
              operator: 'greater_than',
              property: 'monthlyRequests',
              value: {type: 'literal', value: 10000},
            },
          ],
          value: stringifyJsonc({
            requestsPerMinute: 120,
            burstLimit: 20,
          }) as ConfigValue,
        },
        {
          name: 'New users (low usage)',
          conditions: [
            {
              operator: 'less_than',
              property: 'accountAgeDays',
              value: {type: 'literal', value: 30},
            },
          ],
          value: stringifyJsonc({
            requestsPerMinute: 30,
            burstLimit: 5,
          }) as ConfigValue,
        },
      ],
      variants: [],
    },

    // 5 - Config with segmentation (demonstrates percentage-based rollout)
    {
      name: 'example-5-experiment-flags-ab-testing',
      description: 'A/B testing with percentage-based segmentation',
      schema: stringifyJsonc({
        $schema: 'http://json-schema.org/draft-07/schema#',
        type: 'object',
        properties: {
          variant: {type: 'string', enum: ['control', 'treatment_a', 'treatment_b']},
          showNewCheckout: {type: 'boolean'},
        },
        required: ['variant', 'showNewCheckout'],
        additionalProperties: false,
      }) as ConfigSchema,
      value: stringifyJsonc({
        variant: 'control',
        showNewCheckout: false,
      }) as ConfigValue,
      overrides: [
        {
          name: 'Treatment A (25%)',
          conditions: [
            {
              operator: 'segmentation',
              property: 'userId',
              fromPercentage: 0,
              toPercentage: 25,
              seed: 'checkout-experiment-2024',
            },
          ],
          value: stringifyJsonc({
            variant: 'treatment_a',
            showNewCheckout: true,
          }) as ConfigValue,
        },
        {
          name: 'Treatment B (25%)',
          conditions: [
            {
              operator: 'segmentation',
              property: 'userId',
              fromPercentage: 25,
              toPercentage: 50,
              seed: 'checkout-experiment-2024',
            },
          ],
          value: stringifyJsonc({
            variant: 'treatment_b',
            showNewCheckout: true,
          }) as ConfigValue,
        },
      ],
      variants: [],
    },

    // 6 - Config with composite conditions (demonstrates AND/OR logic)
    {
      name: 'example-6-advanced-targeting',
      description: 'Advanced targeting with composite AND/OR conditions',
      schema: stringifyJsonc({
        $schema: 'http://json-schema.org/draft-07/schema#',
        type: 'object',
        properties: {
          featureLevel: {type: 'string'},
          customBranding: {type: 'boolean'},
          supportPriority: {type: 'string', enum: ['standard', 'priority', 'dedicated']},
        },
        required: ['featureLevel', 'customBranding', 'supportPriority'],
        additionalProperties: false,
      }) as ConfigSchema,
      value: stringifyJsonc({
        featureLevel: 'basic',
        customBranding: false,
        supportPriority: 'standard',
      }) as ConfigValue,
      overrides: [
        {
          name: 'VIP customers',
          conditions: [
            {
              operator: 'and',
              conditions: [
                {
                  operator: 'equals',
                  property: 'plan',
                  value: {type: 'literal', value: 'enterprise'},
                },
                {
                  operator: 'greater_than_or_equal',
                  property: 'annualSpend',
                  value: {type: 'literal', value: 50000},
                },
              ],
            },
          ],
          value: stringifyJsonc({
            featureLevel: 'unlimited',
            customBranding: true,
            supportPriority: 'dedicated',
          }) as ConfigValue,
        },
        {
          name: 'Beta testers or employees',
          conditions: [
            {
              operator: 'or',
              conditions: [
                {
                  operator: 'equals',
                  property: 'isBetaTester',
                  value: {type: 'literal', value: true},
                },
                {
                  operator: 'equals',
                  property: 'isEmployee',
                  value: {type: 'literal', value: true},
                },
              ],
            },
          ],
          value: stringifyJsonc({
            featureLevel: 'preview',
            customBranding: true,
            supportPriority: 'priority',
          }) as ConfigValue,
        },
      ],
      variants: [],
    },

    // 7 - Config with environment-specific variants (demonstrates environment-specific configs)
    {
      name: 'example-7-environment-specific-configs',
      description: 'Environment-specific configs with different values for different environments',
      schema: stringifyJsonc({
        $schema: 'http://json-schema.org/draft-07/schema#',
        type: 'object',
        properties: {
          maxUploadSizeMb: {type: 'number', minimum: 1, maximum: 100},
          allowedFileTypes: {type: 'array', items: {type: 'string'}},
          maintenanceMode: {type: 'boolean'},
        },
        required: ['maxUploadSizeMb', 'allowedFileTypes', 'maintenanceMode'],
        additionalProperties: false,
      }) as ConfigSchema,
      value: stringifyJsonc({
        maxUploadSizeMb: 10,
        allowedFileTypes: ['jpg', 'png', 'pdf'],
        maintenanceMode: false,
      }) as ConfigValue,
      overrides: [],
      variants: [
        {
          environmentId: productionId,
          value: stringifyJsonc({
            maxUploadSizeMb: 100,
            allowedFileTypes: ['jpg', 'png', 'pdf', 'gif'],
            maintenanceMode: false,
          }) as ConfigValue,
          schema: null,
          overrides: [],
          useBaseSchema: true,
        },
        {
          environmentId: developmentId,
          value: stringifyJsonc({
            maxUploadSizeMb: 50,
            allowedFileTypes: ['png', 'pdf'],
            maintenanceMode: true,
          }) as ConfigValue,
          schema: null,
          overrides: [],
          useBaseSchema: true,
        },
      ],
    },
  ];
}
