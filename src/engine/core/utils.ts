import Ajv, {type ErrorObject, type JSONSchemaType} from 'ajv';
import assert from 'assert';
import type {NormalizedEmail} from './zod';

export type Brand<T, B> = T & {__brand: () => B | undefined};

export function joinUndefined(...parts: (string | undefined)[]): undefined | string {
  if (parts.some(p => p === undefined)) {
    return undefined;
  }
  return parts.join('');
}

export function ensureDefined<T>(value: T | undefined, message: string): T {
  if (value === undefined || value === null) {
    throw new Error(message);
  }

  return value;
}

function parseBooleanEnv(value: string | undefined): boolean {
  return ['1', 'true', 'yes', 'on'].includes((value ?? '').trim().toLowerCase());
}

export interface OrganizationConfig {
  organizationName: string | null;
  requireProposals: boolean;
  allowSelfApprovals: boolean;
}

export function getOrganizationConfig(): OrganizationConfig {
  const name = process.env.ORGANIZATION_NAME?.trim();
  return {
    organizationName: name && name.length > 0 ? name : null,
    requireProposals: parseBooleanEnv(process.env.REQUIRE_PROPOSALS),
    allowSelfApprovals: parseBooleanEnv(process.env.ALLOW_SELF_APPROVALS),
  };
}

export function chunkArray<T>(array: T[], size: number): T[][] {
  if (size <= 0) {
    throw new Error('Chunk size must be greater than 0');
  }

  const result: T[][] = [];
  for (let i = 0; i < array.length; i += size) {
    result.push(array.slice(i, i + size));
  }
  return result;
}

export function wait(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

export function assertNever(value: never, message: string): never {
  throw new Error(`${message}: ${JSON.stringify(value)}`);
}

export function unique<T>(array: T[]): T[] {
  return Array.from(new Set(array));
}

export function trimEnd(source: string, str: string): string {
  assert(str.length > 0, 'trimEnd string must not be empty');

  let result = source;

  while (result.endsWith(str)) {
    result = result.slice(0, -str.length);
  }

  return result;
}

export function getDaysAgo(date: Date, days: number): Date {
  const result = new Date(date);
  result.setDate(result.getDate() - days);
  return result;
}

export function getStartOfNextUtcDay(date: Date): Date {
  const result = new Date(date);
  result.setUTCHours(0, 0, 0, 0);
  result.setUTCDate(result.getUTCDate() + 1);
  return result;
}

export function getStartOfUtcDay(date: Date): Date {
  const result = new Date(date);
  result.setUTCHours(0, 0, 0, 0);
  return result;
}

export async function mapConcurrently<T, R>(options: {
  items: T[];
  concurrencyLimit: number;
  map: (item: T) => Promise<R>;
}): Promise<R[]> {
  const {items, concurrencyLimit, map} = options;

  assert(concurrencyLimit > 0, 'Concurrency limit must be greater than 0');

  const results: R[] = new Array<R>(items.length);
  const executing = new Set<Promise<void>>();

  for (let i = 0; i < items.length; i++) {
    const p = (async () => {
      const r = await map(items[i]);
      results[i] = r;
    })().finally(() => {
      executing.delete(p);
    });

    executing.add(p);

    if (executing.size >= concurrencyLimit) {
      await Promise.race(executing);
    }
  }

  await Promise.all(executing);
  return results;
}

// JSON Schema validation
// Lightweight wrapper around Ajv with a stable, testable return shape.
const __ajv = new Ajv({allErrors: true, strict: false, allowUnionTypes: true});

export type JsonSchema = JSONSchemaType<any> | Record<string, unknown>;

export type JsonSchemaValidationResult<T = unknown> =
  | {ok: true; value: T}
  | {ok: false; errors: string[]};

export function validateAgainstJsonSchema<T = unknown>(
  value: unknown,
  inputSchema: JsonSchema,
): JsonSchemaValidationResult<T> {
  let schema: JsonSchema;
  // Ajv doesn't allow to compile schema with the same $id, so we need to remove it.
  if (Object.hasOwn(inputSchema, '$id')) {
    schema = {...inputSchema, $id: undefined};
  } else {
    schema = inputSchema;
  }
  const validate = __ajv.compile<T>(schema as JSONSchemaType<T>);
  const valid = validate(value);

  if (valid) {
    return {ok: true, value: value as T};
  }

  const errors: string[] = (validate.errors ?? []).map(formatAjvError);
  return {ok: false, errors};
}

function formatAjvError(err: ErrorObject): string {
  const instancePath =
    err.instancePath ||
    (err.params && 'missingProperty' in err.params ? `/${String(err.params.missingProperty)}` : '');
  const where = instancePath ? `at ${instancePath}` : '';
  return [err.message, where].filter(Boolean).join(' ');
}

// Validates that a given value is a valid JSON Schema (meta-schema validation)
export function isValidJsonSchema(schema: unknown): boolean {
  if (schema === null) return true;
  if (!(typeof schema === 'object' || typeof schema === 'boolean')) return false;
  try {
    return __ajv.validateSchema(schema) as boolean;
  } catch {
    return false;
  }
}

export function normalizeEmail(email: string): NormalizedEmail {
  return email.trim().toLowerCase() as NormalizedEmail;
}
