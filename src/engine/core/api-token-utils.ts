import crypto from 'node:crypto';
import {parse as uuidParse, stringify as uuidStringify} from 'uuid';

export const API_TOKEN_PREFIX = 'rp_'; // distinct from previous 'cm_' usage

// Basic canonical UUID (any version) validation regex.
const UUID_REGEX = /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/;

/**
 * Build a raw API token embedding the apiTokenId so it can be later extracted.
 * New Format (hex):
 *   cm.{hex(random24bytes + uuid16bytes)}
 * - 24 random bytes (entropy) prefixed before the 16 UUID bytes.
 * - Entire 40-byte buffer is hex encoded (80 hex chars) after the fixed prefix.
 */
export function buildRawApiToken(apiTokenId: string): string {
  if (!UUID_REGEX.test(apiTokenId)) {
    throw new Error('Invalid apiTokenId (must be UUID)');
  }
  const uuidBytes = uuidParse(apiTokenId); // 16 bytes
  const randomBytes = crypto.randomBytes(24); // 24 bytes of entropy
  const combined = Buffer.concat([randomBytes, Buffer.from(uuidBytes)]); // 40 bytes
  const hex = combined.toString('hex');
  return API_TOKEN_PREFIX + hex;
}

/**
 * Extract apiTokenId from a raw token produced by buildRawApiToken.
 * Steps:
 * 1. Verify prefix.
 * 2. Interpret remainder as hex. Must be at least 40 hex chars (16 bytes for UUID at end).
 * 3. Take the last 16 bytes -> uuid bytes -> stringify.
 * Returns null for malformed inputs.
 */
export function extractApiTokenId(rawToken: string): string | null {
  if (!rawToken.startsWith(API_TOKEN_PREFIX)) return null;
  const hex = rawToken.slice(API_TOKEN_PREFIX.length);
  if (hex.length < 32) return null; // need at least 16 bytes for uuid
  if (!/^[0-9a-fA-F]+$/.test(hex)) return null;
  try {
    const buf = Buffer.from(hex, 'hex');
    if (buf.length < 16) return null;
    const uuidBytes = buf.subarray(buf.length - 16); // last 16 bytes
    const id = uuidStringify(uuidBytes);
    if (!UUID_REGEX.test(id)) return null;
    return id;
  } catch {
    return null;
  }
}
