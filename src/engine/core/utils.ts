import Ajv, {type ErrorObject, type JSONSchemaType} from 'ajv';
import AjvDraft04 from 'ajv-draft-04';
import addFormats from 'ajv-formats';
import Ajv2019 from 'ajv/dist/2019';
import Ajv2020 from 'ajv/dist/2020';
import draft06MetaSchema from 'ajv/dist/refs/json-schema-draft-06.json';
import assert from 'assert';
import type {Kysely} from 'kysely';
import type {Context} from './context';
import type {DB} from './db';
import {ConflictError} from './errors';
import type {Logger} from './logger';
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
// Supports all JSON Schema drafts: draft-04, draft-06, draft-07, 2019-09, 2020-12

type SchemaVersion = 'draft-04' | 'draft-06' | 'draft-07' | '2019-09' | '2020-12';

/**
 * Creates a fresh Ajv instance for the specified schema version.
 * This ensures validation runs are isolated and not polluted by previous compilations.
 */
function createAjvInstance(version: SchemaVersion): Ajv {
  let ajv: Ajv;

  switch (version) {
    case 'draft-04':
      ajv = new AjvDraft04({allErrors: true, strict: false, allowUnionTypes: true});
      break;
    case '2019-09':
      ajv = new Ajv2019({allErrors: true, strict: false, allowUnionTypes: true});
      break;
    case '2020-12':
      ajv = new Ajv2020({allErrors: true, strict: false, allowUnionTypes: true});
      break;
    case 'draft-06':
    case 'draft-07':
    default:
      // Default Ajv instance supports draft-07 by default
      ajv = new Ajv({allErrors: true, strict: false, allowUnionTypes: true});
      // Add draft-06 meta-schema support (Ajv 8 only includes draft-07 by default)
      ajv.addMetaSchema(draft06MetaSchema);
      break;
  }

  // Add format validators (email, uri, date-time, etc.) to all instances
  addFormats(ajv);

  return ajv;
}

/**
 * Determines the JSON Schema version from the $schema field.
 */
function getSchemaVersion(schema: unknown): SchemaVersion {
  if (typeof schema === 'object' && schema !== null && '$schema' in schema) {
    const schemaVersion = String(schema.$schema);
    if (schemaVersion.includes('draft-04') || schemaVersion.includes('draft/4')) {
      return 'draft-04';
    }
    if (schemaVersion.includes('draft-06') || schemaVersion.includes('draft/6')) {
      return 'draft-06';
    }
    if (schemaVersion.includes('2019-09') || schemaVersion.includes('draft/2019-09')) {
      return '2019-09';
    }
    if (schemaVersion.includes('2020-12') || schemaVersion.includes('draft/2020-12')) {
      return '2020-12';
    }
  }
  // Default to draft-07
  return 'draft-07';
}

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

  // Create a fresh Ajv instance for this validation to avoid pollution
  const version = getSchemaVersion(inputSchema);
  const ajv = createAjvInstance(version);

  const validate = ajv.compile<T>(schema as JSONSchemaType<T>);
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
    // Create a fresh Ajv instance for this validation to avoid pollution
    const version = getSchemaVersion(schema);
    const ajv = createAjvInstance(version);

    return ajv.validateSchema(schema) as boolean;
  } catch {
    return false;
  }
}

export function normalizeEmail(email: string): NormalizedEmail {
  return email.trim().toLowerCase() as NormalizedEmail;
}

// UUID validation regex matching all UUID versions (v1-v7)
const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-7][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

/**
 * Validates if a string is a valid UUID (versions 1-7).
 * @param value - The string to validate
 * @returns true if the value is a valid UUID, false otherwise
 */
export function isValidUuid(value: string): boolean {
  return UUID_REGEX.test(value);
}

export async function runTransactional<T>(params: {
  ctx: Context;
  db: Kysely<DB>;
  fn: (
    ctx: Context,
    tx: Kysely<DB>,
    scheduleOptimisticEffect: (effect: () => Promise<void>) => void,
  ) => Promise<T>;
  onConflictRetriesCount: number;
  logger: Logger;
}): Promise<T> {
  for (let attempt = 0; attempt <= params.onConflictRetriesCount; attempt++) {
    const dbTx = await params.db.startTransaction().setIsolationLevel('serializable').execute();
    try {
      const optimisticEffects: Array<() => Promise<void>> = [];
      function scheduleOptimisticEffect(effect: () => Promise<void>) {
        optimisticEffects.push(effect);
      }

      const result = await params.fn(params.ctx, dbTx, scheduleOptimisticEffect);
      await dbTx.commit().execute();

      void Promise.all(optimisticEffects.map(effect => effect()));

      return result;
    } catch (error) {
      await dbTx.rollback().execute();

      if (error instanceof Error && 'code' in error && error.code === '40001') {
        // we got SerializationFailure (SQLSTATE 40001), retry

        if (attempt === params.onConflictRetriesCount) {
          throw new ConflictError(
            `Transaction failed after ${params.onConflictRetriesCount} attempts due to serialization failure.`,
            {cause: error},
          );
        } else {
          params.logger.warn(params.ctx, {
            msg: `Transaction failed due to serialization failure, retrying... (attempt ${attempt + 1})`,
            attempt,
            error,
          });
        }
      } else {
        throw error;
      }
    }
  }

  throw new Error('runTransactional unreachable');
}

// orders properties by key for stable JSON serialization, arrays aren't sorted
export function toStableJson(value: unknown): string {
  return JSON.stringify(value, (key, value) => {
    if (typeof value === 'object' && value !== null && !Array.isArray(value)) {
      const keys = Object.keys(value).sort();
      const result: Record<string, unknown> = {};
      for (const key of keys) {
        result[key] = value[key];
      }
      return result;
    }
    return value;
  });
}

export function groupBy<T, K>(items: T[], toKey: (item: T) => K): Array<[K, T[]]> {
  const groups = new Map<string, T[]>();
  for (const item of items) {
    const key = toKey(item);
    const combinedKey = toStableJson(key);
    if (!groups.has(combinedKey)) {
      groups.set(combinedKey, []);
    }
    groups.get(combinedKey)!.push(item);
  }

  return Array.from(groups.entries()).map(([key, value]) => [JSON.parse(key) as K, value]);
}
