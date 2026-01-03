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
      // JSONC: comments can be used to document why a flag is enabled/disabled
      value: `// Feature is enabled for all users
true` as ConfigValue,
      overrides: [],
      variants: [],
    },

    // 2 - Object config with JSON Schema (demonstrates schema validation and JSONC)
    {
      name: 'example-2-app-settings',
      description: 'Application settings',
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
      // JSONC: inline comments explain each setting, trailing commas allow easy reordering
      value: `{
  // Maximum file size in megabytes (adjust based on server capacity)
  "maxUploadSizeMb": 10,

  // Supported file extensions - add more as needed
  "allowedFileTypes": [
    "jpg",
    "png",
    "pdf", // trailing comma makes it easy to add more types
  ],

  // Set to true during deployments or outages
  "maintenanceMode": false,
}` as ConfigValue,
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
      value: `{
  /*
   * Default rate limits for standard users.
   * These values are tuned for typical API usage patterns.
   */
  "requestsPerMinute": 60,  // 1 request per second average
  "burstLimit": 10,         // allows short bursts of activity
}` as ConfigValue,
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
          value: `{
  // 2x limits for high-volume users (>10k monthly requests)
  "requestsPerMinute": 120,
  "burstLimit": 20,
}` as ConfigValue,
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
          value: `{
  // Conservative limits for new accounts (<30 days)
  // Prevents abuse while they build trust
  "requestsPerMinute": 30,
  "burstLimit": 5,
}` as ConfigValue,
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
      // Control group: 50% of users see the original checkout
      value: `{
  // Experiment: checkout-experiment-2024
  // Hypothesis: Simplified checkout will increase conversion by 15%
  // Start date: 2024-01-15
  "variant": "control",
  "showNewCheckout": false, // original checkout flow
}` as ConfigValue,
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
          value: `{
  // Treatment A: Single-page checkout (0-25% of users)
  "variant": "treatment_a",
  "showNewCheckout": true,
}` as ConfigValue,
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
          value: `{
  // Treatment B: Multi-step wizard checkout (25-50% of users)
  "variant": "treatment_b",
  "showNewCheckout": true,
}` as ConfigValue,
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
      value: `{
  /*
   * Default tier for all users.
   * Feature levels: basic < preview < unlimited
   */
  "featureLevel": "basic",
  "customBranding": false,
  "supportPriority": "standard", // 24-48h response time
}` as ConfigValue,
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
          value: `{
  /*
   * VIP Tier: Enterprise plan + $50k+ annual spend
   * Per agreement with Sales team
   */
  "featureLevel": "unlimited",
  "customBranding": true,        // white-label support
  "supportPriority": "dedicated", // dedicated CSM, 1h SLA
}` as ConfigValue,
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
          value: `{
  // Preview access for internal testing
  // Includes unreleased features - may be unstable!
  "featureLevel": "preview",
  "customBranding": true,
  "supportPriority": "priority", // faster response for bug reports
}` as ConfigValue,
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
      // Base/fallback values - used when no environment-specific variant matches
      value: `{
  // Base configuration - conservative defaults
  "maxUploadSizeMb": 10,
  "allowedFileTypes": ["jpg", "png", "pdf"],
  "maintenanceMode": false,
}` as ConfigValue,
      overrides: [],
      variants: [
        {
          environmentId: productionId,
          value: `{
  /*
   * PRODUCTION settings
   * Higher limits to handle real user traffic
   */
  "maxUploadSizeMb": 100, // increased for enterprise customers

  "allowedFileTypes": [
    "jpg",
    "png",
    "pdf",
    "gif", // added per customer request JIRA-1234
  ],

  "maintenanceMode": false, // NEVER set to true without approval!
}` as ConfigValue,
          schema: null,
          overrides: [],
          useBaseSchema: true,
        },
        {
          environmentId: developmentId,
          value: `{
  /*
   * DEVELOPMENT settings
   * Restrictive limits to catch issues early
   */
  "maxUploadSizeMb": 50, // lower than prod to test edge cases

  "allowedFileTypes": [
    "png",
    "pdf",
    // TODO: add jpg once image processing is fixed
  ],

  "maintenanceMode": true, // enables maintenance UI for testing
}` as ConfigValue,
          schema: null,
          overrides: [],
          useBaseSchema: true,
        },
      ],
    },
  ];
}
