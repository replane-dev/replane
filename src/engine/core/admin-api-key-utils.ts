import {parse as uuidParse, stringify as uuidStringify} from 'uuid';
import {API_KEY_PREFIX_LENGTH, API_KEY_SUFFIX_LENGTH} from './constants';

export const ADMIN_API_KEY_PREFIX = 'rpa_'; // replane admin

// Basic canonical UUID (any version) validation regex.
const UUID_REGEX = /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/;

/**
 * Build a raw admin API key embedding the keyId so it can be later extracted.
 * Format (hex):
 *   rpa_{hex(random24bytes + uuid16bytes)}
 * - 24 random bytes (entropy) prefixed before the 16 UUID bytes.
 * - Entire 40-byte buffer is hex encoded (80 hex chars) after the fixed prefix.
 */
export function buildRawAdminApiKey(keyId: string): string {
  if (!UUID_REGEX.test(keyId)) {
    throw new Error('Invalid keyId (must be UUID)');
  }
  const uuidBytes = uuidParse(keyId); // 16 bytes
  const randomBytes = crypto.getRandomValues(new Uint8Array(24)); // 24 bytes of entropy
  const combined = new Uint8Array(24 + 16);
  combined.set(randomBytes, 0);
  combined.set(uuidBytes, 24);
  const hex = bytesToHex(combined);
  return ADMIN_API_KEY_PREFIX + hex;
}

/**
 * Extract keyId from a raw token produced by buildRawAdminApiKey.
 * Steps:
 * 1. Verify prefix.
 * 2. Interpret remainder as hex. Must be at least 40 hex chars (16 bytes for UUID at end).
 * 3. Take the last 16 bytes -> uuid bytes -> stringify.
 * Returns null for malformed inputs.
 */
export function extractAdminApiKeyId(rawKey: string): string | null {
  if (!rawKey.startsWith(ADMIN_API_KEY_PREFIX)) return null;
  const hex = rawKey.slice(ADMIN_API_KEY_PREFIX.length);
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

/**
 * Get the prefix portion of an admin API key for display (first N hex chars after the rpa_ prefix).
 */
export function getAdminApiKeyPrefix(rawKey: string): string {
  if (!rawKey.startsWith(ADMIN_API_KEY_PREFIX)) {
    throw new Error('Invalid admin API key format');
  }
  return rawKey.slice(0, ADMIN_API_KEY_PREFIX.length + API_KEY_PREFIX_LENGTH);
}

/**
 * Get the suffix portion of an admin API key for display (last N hex chars).
 */
export function getAdminApiKeySuffix(rawKey: string): string {
  if (!rawKey.startsWith(ADMIN_API_KEY_PREFIX)) {
    throw new Error('Invalid admin API key format');
  }
  return rawKey.slice(-API_KEY_SUFFIX_LENGTH);
}

/**
 * Hash an admin API key for secure storage.
 * Uses SHA-256.
 */
export async function hashAdminApiKey(rawKey: string): Promise<string> {
  const encoder = new TextEncoder();
  const data = encoder.encode(rawKey);
  const hashBuffer = await crypto.subtle.digest('SHA-256', data);
  const hashArray = new Uint8Array(hashBuffer);
  return bytesToHex(hashArray);
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
