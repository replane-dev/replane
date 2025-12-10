import {describe, expect, it} from 'vitest';
import {SDK_KEY_PREFIX, buildRawSdkKey, extractSdkKeyId} from '../src/engine/core/sdk-key-utils';
import {createUuidV7} from '../src/engine/core/uuid';

describe('api-token-utils', () => {
  it('embeds and extracts apiTokenId (hex variant)', () => {
    const id = createUuidV7();
    const token = buildRawSdkKey(id);
    expect(token.startsWith(SDK_KEY_PREFIX)).toBe(true);
    // After prefix should be only hex chars
    const body = token.slice(SDK_KEY_PREFIX.length);
    expect(/^[0-9a-f]+$/i.test(body)).toBe(true);
    // Length: 24 random bytes + 16 uuid bytes = 40 bytes => 80 hex chars
    expect(body.length).toBe(80);
    const extracted = extractSdkKeyId(token);
    expect(extracted).toBe(id);
  });

  it('throws on invalid uuid input to build', () => {
    expect(() => buildRawSdkKey('not-a-uuid')).toThrow();
  });

  it('returns null for invalid prefix', () => {
    const id = createUuidV7();
    const token = buildRawSdkKey(id).replace(SDK_KEY_PREFIX, 'xx.');
    expect(extractSdkKeyId(token)).toBeNull();
  });

  it('returns null for malformed token', () => {
    expect(extractSdkKeyId(SDK_KEY_PREFIX)).toBeNull();
    // non-hex chars
    expect(extractSdkKeyId(SDK_KEY_PREFIX + 'zz-not-hex')).toBeNull();
    // too short to contain uuid bytes (need >=32 hex chars)
    expect(extractSdkKeyId(SDK_KEY_PREFIX + 'abcd')).toBeNull();
  });
});
