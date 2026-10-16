import {describe, expect, it} from 'vitest';
import {ConfigSchema, ConfigValue} from './zod';

function largeSchema(minSize: number): string {
  const property = {type: 'string', description: 'x'.repeat(100)};
  const propertySize = JSON.stringify({property_0: property}).length;
  const count = Math.ceil(minSize / propertySize);
  const properties: Record<string, typeof property> = {};
  for (let i = 0; i < count; i++) {
    properties[`property_${i}`] = property;
  }
  const schema = JSON.stringify({type: 'object', properties});
  expect(schema.length).toBeGreaterThanOrEqual(minSize);
  expect(schema.length).toBeLessThan(minSize * 1.05);
  return schema;
}

describe('ConfigValue', () => {
  it('minifies the value', () => {
    expect(ConfigValue().parse('{\n  "a": 1,\n  "b": [1, 2]\n}')).toBe('{"a":1,"b":[1,2]}');
  });

  it('keeps values with comments as is', () => {
    const value = '{\n  // comment\n  "a": 1\n}';

    expect(ConfigValue().parse(value)).toBe(value);
  });

  it('applies the size limit to the minified value', () => {
    const value = `{"a":${' '.repeat(1_100_000)}1}`;

    expect(value.length).toBeGreaterThan(1_048_576);
    expect(ConfigValue().safeParse(value).success).toBe(true);
  });
});

describe('ConfigSchema', () => {
  it('minifies the schema', () => {
    expect(ConfigSchema().parse('{\n  "type": "object"\n}')).toBe('{"type":"object"}');
  });

  it('accepts schemas larger than 128KB', () => {
    const schema = largeSchema(200 * 1024);

    expect(ConfigSchema().safeParse(schema).success).toBe(true);
  });

  it('accepts a pretty-printed schema whose minified size is under the limit', () => {
    const schema = JSON.stringify(JSON.parse(largeSchema(900 * 1024)), null, 8);

    expect(schema.length).toBeGreaterThan(1_048_576);
    expect(ConfigSchema().safeParse(schema).success).toBe(true);
  });

  it('rejects schemas larger than 1MB', () => {
    const result = ConfigSchema().safeParse(largeSchema(1_048_576));

    expect(result.success).toBe(false);
    expect(result.error?.issues[0]?.message).toMatch(/maximum size is 1MB/);
  });
});
