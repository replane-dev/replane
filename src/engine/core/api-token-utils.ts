import {parse as uuidParse, stringify as uuidStringify} from 'uuid';

export const API_TOKEN_PREFIX = 'rp_'; // distinct from previous 'cm_' usage

// Basic canonical UUID (any version) validation regex.
const UUID_REGEX = /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/;

/**
 * Build a raw API token embedding the apiTokenId so it can be later extracted.
 * New Format (hex):
 *   rp_{hex(random24bytes + uuid16bytes)}
 * - 24 random bytes (entropy) prefixed before the 16 UUID bytes.
 * - Entire 40-byte buffer is hex encoded (80 hex chars) after the fixed prefix.
 */
export function buildRawApiToken(apiTokenId: string): string {
  if (!UUID_REGEX.test(apiTokenId)) {
    throw new Error('Invalid apiTokenId (must be UUID)');
  }
  const uuidBytes = uuidParse(apiTokenId); // 16 bytes
  const randomBytes = crypto.getRandomValues(new Uint8Array(24)); // 24 bytes of entropy
  const combined = new Uint8Array(24 + 16);
  combined.set(randomBytes, 0);
  combined.set(uuidBytes, 24);
  const hex = bytesToHex(combined);
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
    const bytes = hexToBytes(hex);
    if (bytes.length < 16) return null;
    const uuidBytes = bytes.subarray(bytes.length - 16); // last 16 bytes
    const id = uuidStringify(uuidBytes);
    if (!UUID_REGEX.test(id)) return null;
    return id;
  } catch {
    return null;
  }
}

function bytesToHex(bytes: Uint8Array): string {
  let hex = '';
  for (let i = 0; i < bytes.length; i++) {
    hex += bytes[i].toString(16).padStart(2, '0');
  }
  return hex;
}

function hexToBytes(hex: string): Uint8Array {
  const clean = hex.length % 2 === 0 ? hex : '0' + hex;
  const len = clean.length / 2;
  const out = new Uint8Array(len);
  for (let i = 0; i < len; i++) {
    const byte = clean.substr(i * 2, 2);
    out[i] = parseInt(byte, 16);
  }
  return out;
}
