/**
 * Infer a JSON Schema from a given value.
 *
 * This function analyzes a JSON value and generates a matching JSON Schema (draft-07).
 * It recursively processes nested objects and arrays to create a comprehensive schema.
 *
 * @param value - The value to infer a schema from
 * @returns A JSON Schema object that matches the structure and types of the value
 *
 * @example
 * ```typescript
 * const value = { name: "John", age: 30 };
 * const schema = inferSchemaFromValue(value);
 * // Returns: { type: "object", properties: { name: { type: "string" }, age: { type: "integer" } }, required: ["name", "age"] }
 * ```
 */
export function inferSchemaFromValue(value: unknown): object {
  if (value === null) {
    return {type: 'null'};
  }

  if (Array.isArray(value)) {
    if (value.length === 0) {
      return {
        type: 'array',
        items: {},
      };
    }
    // Infer schema from first item
    const itemSchema = inferSchemaFromValue(value[0]);
    return {
      type: 'array',
      items: itemSchema,
    };
  }

  if (typeof value === 'object') {
    const properties: Record<string, object> = {};
    const required: string[] = [];

    for (const [key, val] of Object.entries(value)) {
      properties[key] = inferSchemaFromValue(val);
      required.push(key);
    }

    return {
      type: 'object',
      properties,
      ...(required.length > 0 ? {required} : {}),
    };
  }

  if (typeof value === 'string') {
    return {type: 'string'};
  }

  if (typeof value === 'number') {
    return Number.isInteger(value) ? {type: 'integer'} : {type: 'number'};
  }

  if (typeof value === 'boolean') {
    return {type: 'boolean'};
  }

  return {};
}

/**
 * Create a complete JSON Schema with $schema declaration from a value.
 *
 * @param value - The value to infer a schema from
 * @param schemaVersion - The JSON Schema version to use (default: draft-07)
 * @returns A complete JSON Schema object with $schema field
 *
 * @example
 * ```typescript
 * const value = { name: "John" };
 * const schema = createSchemaFromValue(value);
 * // Returns: { $schema: "http://json-schema.org/draft-07/schema#", type: "object", ... }
 * ```
 */
export function createSchemaFromValue(
  value: unknown,
  schemaVersion: 'draft-04' | 'draft-06' | 'draft-07' | '2019-09' | '2020-12' = 'draft-07',
): object {
  const schemaUrls = {
    'draft-04': 'http://json-schema.org/draft-04/schema#',
    'draft-06': 'http://json-schema.org/draft-06/schema#',
    'draft-07': 'http://json-schema.org/draft-07/schema#',
    '2019-09': 'https://json-schema.org/draft/2019-09/schema',
    '2020-12': 'https://json-schema.org/draft/2020-12/schema',
  };

  return {
    $schema: schemaUrls[schemaVersion],
    ...inferSchemaFromValue(value),
  };
}
