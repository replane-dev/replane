import assert from 'assert';
import {GLOBAL_CONTEXT} from '../context';
import type {DateProvider} from '../date-provider';
import type {Override} from '../override-condition-schemas';
import {ConfigStore, createConfigId} from '../stores/config-store';
import type {ConfigVariantStore} from '../stores/config-variant-store';
import type {ProjectEnvironmentStore} from '../stores/project-environment-store';
import type {TransactionalUseCase} from '../use-case';
import type {User, UserStore} from '../user-store';
import {createUuidV7} from '../uuid';
import {asConfigSchema, asConfigValue, type ConfigValue, type NormalizedEmail} from '../zod';

export interface AddExampleConfigsRequest {
  projectId: string;
  currentUserEmail: NormalizedEmail;
}

export interface AddExampleConfigsResponse {
  addedConfigsCount: number;
}

export interface AddExampleConfigsUseCaseDeps {
  dateProvider: DateProvider;
}

export function createAddExampleConfigsUseCase(
  deps: AddExampleConfigsUseCaseDeps,
): TransactionalUseCase<AddExampleConfigsRequest, AddExampleConfigsResponse> {
  return async (ctx, tx, req) => {
    // Verify permission to create configs in this project
    await tx.permissionService.ensureCanCreateConfig(ctx, {
      projectId: req.projectId,
      currentUserEmail: req.currentUserEmail,
    });

    const currentUser = await tx.users.getByEmail(req.currentUserEmail);
    assert(currentUser, 'Current user not found');

    const {addedConfigsCount} = await createExampleConfigs({
      projectId: req.projectId,
      configs: tx.configs,
      configVariants: tx.configVariants,
      projectEnvironments: tx.projectEnvironments,
      dateProvider: deps.dateProvider,
      users: tx.users,
      currentUser: currentUser,
    });

    return {addedConfigsCount};
  };
}

export async function createExampleConfigs(params: {
  projectId: string;
  configs: ConfigStore;
  configVariants: ConfigVariantStore;
  projectEnvironments: ProjectEnvironmentStore;
  dateProvider: DateProvider;
  users: UserStore;
  currentUser: User;
}) {
  const {
    projectId,
    configs,
    configVariants,
    projectEnvironments,
    dateProvider,
    users,
    currentUser,
  } = params;
  const now = dateProvider.now();

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

    // Create config with default variant data included directly
    await configs.create(GLOBAL_CONTEXT, {
      id: configId,
      name: config.name,
      projectId: projectId,
      description: config.description,
      value: config.value,
      schema: asConfigSchema(config.schema),
      overrides: config.overrides,
      createdAt: now,
      updatedAt: now,
      version: 1,
    });

    // Create environment-specific variants
    for (const variant of config.variants) {
      await configVariants.create({
        id: createUuidV7(),
        configId: configId,
        environmentId: variant.environmentId,
        value: variant.value,
        schema: asConfigSchema(variant.schema),
        createdAt: now,
        updatedAt: now,
        useDefaultSchema: variant.useDefaultSchema,
        overrides: variant.overrides,
      });
    }

    addedCount++;
  }

  return {addedConfigsCount: addedCount};
}

interface ExampleConfig {
  name: string;
  schema: unknown;
  value: ConfigValue;
  overrides: Override[];
  description: string;
  variants: Array<{
    environmentId: string;
    value: ConfigValue;
    schema: unknown;
    overrides: Override[];
    useDefaultSchema: boolean;
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
      schema: {
        $schema: 'http://json-schema.org/draft-07/schema#',
        type: 'boolean',
      },
      value: asConfigValue(true),
      overrides: [],
      variants: [],
    },

    // 2 - Object config with JSON Schema (demonstrates schema validation)
    {
      name: 'example-2-app-settings',
      description: 'Application settings with JSON Schema validation',
      schema: {
        $schema: 'http://json-schema.org/draft-07/schema#',
        type: 'object',
        properties: {
          maxUploadSizeMb: {type: 'number', minimum: 1, maximum: 100},
          allowedFileTypes: {type: 'array', items: {type: 'string'}},
          maintenanceMode: {type: 'boolean'},
        },
        required: ['maxUploadSizeMb', 'allowedFileTypes', 'maintenanceMode'],
        additionalProperties: false,
      },
      value: asConfigValue({
        maxUploadSizeMb: 10,
        allowedFileTypes: ['jpg', 'png', 'pdf'],
        maintenanceMode: false,
      }),
      overrides: [],
      variants: [],
    },

    // 3 - Config with property-based override (demonstrates conditional targeting)
    {
      name: 'example-3-user-access',
      description: 'User access level with conditional overrides based on user properties',
      schema: {
        $schema: 'http://json-schema.org/draft-07/schema#',
        type: 'string',
        enum: ['basic', 'premium', 'enterprise'],
      },
      value: asConfigValue('basic'),
      overrides: [
        {
          name: 'Premium users',
          conditions: [
            {
              operator: 'equals',
              property: 'subscription',
              value: {type: 'literal', value: asConfigValue('premium')},
            },
          ],
          value: asConfigValue('premium'),
        },
        {
          name: 'Enterprise users',
          conditions: [
            {
              operator: 'in',
              property: 'organization',
              value: {type: 'literal', value: asConfigValue(['acme-corp', 'globex', 'initech'])},
            },
          ],
          value: asConfigValue('enterprise'),
        },
      ],
      variants: [],
    },

    // 4 - Config with comparison operators (demonstrates numeric conditions)
    {
      name: 'example-4-rate-limits',
      description: 'API rate limits based on user tier and usage',
      schema: {
        $schema: 'http://json-schema.org/draft-07/schema#',
        type: 'object',
        properties: {
          requestsPerMinute: {type: 'number'},
          burstLimit: {type: 'number'},
        },
        required: ['requestsPerMinute', 'burstLimit'],
        additionalProperties: false,
      },
      value: asConfigValue({
        requestsPerMinute: 60,
        burstLimit: 10,
      }),
      overrides: [
        {
          name: 'High volume users',
          conditions: [
            {
              operator: 'greater_than',
              property: 'monthlyRequests',
              value: {type: 'literal', value: asConfigValue(10000)},
            },
          ],
          value: asConfigValue({
            requestsPerMinute: 120,
            burstLimit: 20,
          }),
        },
        {
          name: 'New users (low usage)',
          conditions: [
            {
              operator: 'less_than',
              property: 'accountAgeDays',
              value: {type: 'literal', value: asConfigValue(30)},
            },
          ],
          value: asConfigValue({
            requestsPerMinute: 30,
            burstLimit: 5,
          }),
        },
      ],
      variants: [],
    },

    // 5 - Config with segmentation (demonstrates percentage-based rollout)
    {
      name: 'example-5-experiment-flags-ab-testing',
      description: 'A/B testing with percentage-based segmentation',
      schema: {
        $schema: 'http://json-schema.org/draft-07/schema#',
        type: 'object',
        properties: {
          variant: {type: 'string', enum: ['control', 'treatment_a', 'treatment_b']},
          showNewCheckout: {type: 'boolean'},
        },
        required: ['variant', 'showNewCheckout'],
        additionalProperties: false,
      },
      value: asConfigValue({
        variant: 'control',
        showNewCheckout: false,
      }),
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
          value: asConfigValue({
            variant: 'treatment_a',
            showNewCheckout: true,
          }),
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
          value: asConfigValue({
            variant: 'treatment_b',
            showNewCheckout: true,
          }),
        },
      ],
      variants: [],
    },

    // 6 - Config with composite conditions (demonstrates AND/OR logic)
    {
      name: 'example-6-advanced-targeting',
      description: 'Advanced targeting with composite AND/OR conditions',
      schema: {
        $schema: 'http://json-schema.org/draft-07/schema#',
        type: 'object',
        properties: {
          featureLevel: {type: 'string'},
          customBranding: {type: 'boolean'},
          supportPriority: {type: 'string', enum: ['standard', 'priority', 'dedicated']},
        },
        required: ['featureLevel', 'customBranding', 'supportPriority'],
        additionalProperties: false,
      },
      value: asConfigValue({
        featureLevel: 'basic',
        customBranding: false,
        supportPriority: 'standard',
      }),
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
                  value: {type: 'literal', value: asConfigValue('enterprise')},
                },
                {
                  operator: 'greater_than_or_equal',
                  property: 'annualSpend',
                  value: {type: 'literal', value: asConfigValue(50000)},
                },
              ],
            },
          ],
          value: asConfigValue({
            featureLevel: 'unlimited',
            customBranding: true,
            supportPriority: 'dedicated',
          }),
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
                  value: {type: 'literal', value: asConfigValue(true)},
                },
                {
                  operator: 'equals',
                  property: 'isEmployee',
                  value: {type: 'literal', value: asConfigValue(true)},
                },
              ],
            },
          ],
          value: asConfigValue({
            featureLevel: 'preview',
            customBranding: true,
            supportPriority: 'priority',
          }),
        },
      ],
      variants: [],
    },

    // 7 - Config with environment-specific variants (demonstrates environment-specific configs)
    {
      name: 'example-7-environment-specific-configs',
      description: 'Environment-specific configs with different values for different environments',
      schema: {
        $schema: 'http://json-schema.org/draft-07/schema#',
        type: 'object',
        properties: {
          maxUploadSizeMb: {type: 'number', minimum: 1, maximum: 100},
          allowedFileTypes: {type: 'array', items: {type: 'string'}},
          maintenanceMode: {type: 'boolean'},
        },
        required: ['maxUploadSizeMb', 'allowedFileTypes', 'maintenanceMode'],
        additionalProperties: false,
      },
      value: asConfigValue({
        maxUploadSizeMb: 10,
        allowedFileTypes: ['jpg', 'png', 'pdf'],
        maintenanceMode: false,
      }),
      overrides: [],
      variants: [
        {
          environmentId: productionId,
          value: asConfigValue({
            maxUploadSizeMb: 100,
            allowedFileTypes: ['jpg', 'png', 'pdf', 'gif'],
            maintenanceMode: false,
          }),
          schema: null,
          overrides: [],
          useDefaultSchema: true,
        },
        {
          environmentId: developmentId,
          value: asConfigValue({
            maxUploadSizeMb: 50,
            allowedFileTypes: ['png', 'pdf'],
            maintenanceMode: true,
          }),
          schema: null,
          overrides: [],
          useDefaultSchema: true,
        },
      ],
    },
  ];
}
