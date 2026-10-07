import {GLOBAL_CONTEXT} from '@/engine/core/context';
import {generateRustTypes} from '@/engine/core/use-cases/get-project-config-types-use-case';
import {normalizeEmail, stringifyJsonc} from '@/engine/core/utils';
import type {ConfigSchema, ConfigValue} from '@/engine/core/zod';
import {
  generateUsageSnippet,
  generateUsageSnippetWithCodegen,
  getTypesFileName,
  SDK_LANGUAGE_LIST,
} from '@/lib/sdk-languages';
import {describe, expect, it} from 'vitest';
import {useAppFixture} from './fixtures/app-fixture';

function asConfigValue(value: unknown): ConfigValue {
  return stringifyJsonc(value) as ConfigValue;
}

function asConfigSchema(value: unknown): ConfigSchema {
  return stringifyJsonc(value) as ConfigSchema;
}

const ADMIN_USER_EMAIL = normalizeEmail('admin@example.com');

describe('generateRustTypes', () => {
  it('generates a named type for every primitive config', async () => {
    const code = await generateRustTypes([
      {name: 'rate-limit', schema: {type: 'integer'}},
      {name: 'new-checkout', schema: {type: 'boolean'}},
      {name: 'welcome_message', schema: {type: 'string'}},
      {name: 'discountRate', schema: {type: 'number'}},
    ]);

    expect(code).toContain('pub type RateLimit = i64;');
    expect(code).toContain('pub type NewCheckout = bool;');
    expect(code).toContain('pub type WelcomeMessage = String;');
    expect(code).toContain('pub type DiscountRate = f64;');
  });

  it('generates serde structs with public fields for object configs', async () => {
    const code = await generateRustTypes([
      {
        name: 'checkout-settings',
        schema: {
          type: 'object',
          properties: {enabled: {type: 'boolean'}, maxItems: {type: 'integer'}},
          required: ['enabled'],
          additionalProperties: false,
        },
      },
    ]);

    expect(code).toContain('use serde::{Serialize, Deserialize};');
    expect(code).toContain(
      [
        '#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]',
        '#[serde(rename_all = "camelCase")]',
        'pub struct CheckoutSettings {',
      ].join('\n'),
    );
    expect(code).toContain('pub enabled: bool,');
    expect(code).toContain('pub max_items: Option<i64>,');
  });

  it('generates enums for string enum configs', async () => {
    const code = await generateRustTypes([
      {name: 'log-level', schema: {type: 'string', enum: ['debug', 'info']}},
    ]);

    expect(code).toMatch(/pub enum LogLevel \{\s+Debug,\s+Info,\s+\}/);
  });

  it('resolves $defs references within a config schema', async () => {
    const code = await generateRustTypes([
      {
        name: 'payments',
        schema: {
          type: 'object',
          properties: {provider: {$ref: '#/$defs/Provider'}},
          required: ['provider'],
          $defs: {
            Provider: {
              type: 'object',
              properties: {name: {type: 'string'}},
              required: ['name'],
            },
          },
        },
      },
    ]);

    expect(code).toContain('pub struct Payments {');
    expect(code).toContain('pub provider: Provider,');
    expect(code).toContain('pub struct Provider {');
    expect(code).toContain('pub name: String,');
  });

  it('names config types after the config even when the schema has a title', async () => {
    const code = await generateRustTypes([
      {
        name: 'payment-provider',
        schema: {title: 'ProviderSettings', type: 'object', properties: {id: {type: 'string'}}},
      },
      {
        name: 'payments',
        schema: {
          type: 'object',
          properties: {account: {$ref: '#/$defs/Account'}},
          $defs: {Account: {type: 'object', properties: {iban: {type: 'string'}}}},
        },
      },
    ]);

    expect(code).toContain('pub struct PaymentProvider {');
    expect(code).not.toContain('ProviderSettings');
  });

  it('uses serde_json::Value for configs without a schema', async () => {
    const code = await generateRustTypes([{name: 'legacy-blob', schema: null}]);

    expect(code).toContain('pub type LegacyBlob = Option<serde_json::Value>;');
  });

  it('omits quicktype example comments', async () => {
    const code = await generateRustTypes([{name: 'rate-limit', schema: {type: 'integer'}}]);

    expect(code).not.toContain('extern crate');
    expect(code).not.toContain('serde_json::from_str');
  });

  it('allows unused config types in the generated module', async () => {
    const code = await generateRustTypes([{name: 'rate-limit', schema: {type: 'integer'}}]);

    expect(code.startsWith('#![allow(dead_code)]\n\n')).toBe(true);
  });
});

describe('Rust SDK snippets', () => {
  it('is offered as an SDK language', () => {
    expect(SDK_LANGUAGE_LIST).toContain('rust');
    expect(getTypesFileName('rust')).toBe('replane_types.rs');
  });

  it('generates a basic usage snippet', () => {
    const snippet = generateUsageSnippet({
      language: 'rust',
      sdkKey: 'rp_test',
      baseUrl: 'https://replane.example.com',
      exampleConfigName: 'my-config',
    });

    expect(snippet).toContain('ConnectOptions::new("https://replane.example.com", "rp_test")');
    expect(snippet).toContain('let config: Value = replane.get("my-config")?;');
  });

  it('generates typed reads in the codegen usage snippet', () => {
    const snippet = generateUsageSnippetWithCodegen({
      language: 'rust',
      sdkKey: 'rp_test',
      baseUrl: 'https://replane.example.com',
      exampleConfigName: 'checkout-settings',
      configNames: ['checkout-settings', 'rate-limit', 'newCheckoutFlow', 'not-shown'],
    });

    expect(snippet).toContain('mod replane_types;');
    expect(snippet).toContain('use replane_types::{CheckoutSettings, RateLimit, NewCheckoutFlow};');
    expect(snippet).toContain(
      'let checkout_settings: CheckoutSettings = replane.get("checkout-settings")?;',
    );
    expect(snippet).toContain('let rate_limit: RateLimit = replane.get("rate-limit")?;');
    expect(snippet).toContain(
      'let new_checkout_flow: NewCheckoutFlow = replane.get("newCheckoutFlow")?;',
    );
    expect(snippet).not.toContain('NotShown');
  });
});

describe('getProjectConfigTypes', () => {
  const fixture = useAppFixture({authEmail: ADMIN_USER_EMAIL});

  it('generates Rust types for project configs', async () => {
    await fixture.createConfig({
      name: 'checkout-settings',
      value: asConfigValue({enabled: true}),
      schema: asConfigSchema({
        type: 'object',
        properties: {enabled: {type: 'boolean'}},
        required: ['enabled'],
      }),
      overrides: [],
      description: 'Checkout settings',
      identity: fixture.identity,
      editorEmails: [],
      maintainerEmails: [],
      projectId: fixture.projectId,
    });
    await fixture.createConfig({
      name: 'rate-limit',
      value: asConfigValue(100),
      schema: asConfigSchema({type: 'integer'}),
      overrides: [],
      description: 'Rate limit',
      identity: fixture.identity,
      editorEmails: [],
      maintainerEmails: [],
      projectId: fixture.projectId,
    });

    const result = await fixture.engine.useCases.getProjectConfigTypes(GLOBAL_CONTEXT, {
      identity: fixture.identity,
      projectId: fixture.projectId,
      environmentId: fixture.productionEnvironmentId,
      language: 'rust',
    });

    expect(result.language).toBe('rust');
    expect(result.configNames.sort()).toEqual(['checkout-settings', 'rate-limit']);
    expect(result.types).toMatch(/^\/\/ Auto-generated types for Replane configuration\n/);
    expect(result.types).toContain('// Project:     Test Project');
    expect(result.types).toContain('// Environment: Production');
    expect(result.types).not.toMatch(/[ \t]+$/m);
    expect(result.types).toContain('pub struct CheckoutSettings {');
    expect(result.types).toContain('pub type RateLimit = i64;');
  });
});
