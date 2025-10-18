import assert from 'assert';
import type {JsonValue} from './db';

export function fromJsonb<T>(jsonb: JsonValue | null): T | null {
  if (jsonb === null) {
    return null;
  }
  assert(typeof jsonb === 'object' && jsonb !== null && 'value' in jsonb);
  return jsonb.value as T;
}

export function toJsonb<T>(value: T): JsonValue {
  return {value} as unknown as JsonValue;
}
