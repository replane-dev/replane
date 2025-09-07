import {describe, expect, it} from 'vitest';
import {
  API_TOKEN_PREFIX,
  buildRawApiToken,
  extractApiTokenId,
} from '../src/engine/core/api-token-utils';
import {createUuidV7} from '../src/engine/core/uuid';

describe('api-token-utils', () => {
  it('embeds and extracts apiTokenId (hex variant)', () => {
    const id = createUuidV7();
    const token = buildRawApiToken(id);
    expect(token.startsWith(API_TOKEN_PREFIX)).toBe(true);
    // After prefix should be only hex chars
    const body = token.slice(API_TOKEN_PREFIX.length);
    expect(/^[0-9a-f]+$/i.test(body)).toBe(true);
    // Length: 24 random bytes + 16 uuid bytes = 40 bytes => 80 hex chars
    expect(body.length).toBe(80);
    const extracted = extractApiTokenId(token);
    expect(extracted).toBe(id);
  });

  it('throws on invalid uuid input to build', () => {
    expect(() => buildRawApiToken('not-a-uuid')).toThrow();
  });

  it('returns null for invalid prefix', () => {
    const id = createUuidV7();
    const token = buildRawApiToken(id).replace(API_TOKEN_PREFIX, 'xx.');
    expect(extractApiTokenId(token)).toBeNull();
  });

  it('returns null for malformed token', () => {
    expect(extractApiTokenId(API_TOKEN_PREFIX)).toBeNull();
    // non-hex chars
    expect(extractApiTokenId(API_TOKEN_PREFIX + 'zz-not-hex')).toBeNull();
    // too short to contain uuid bytes (need >=32 hex chars)
    expect(extractApiTokenId(API_TOKEN_PREFIX + 'abcd')).toBeNull();
  });
});
