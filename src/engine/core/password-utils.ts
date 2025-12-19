import * as argon2 from 'argon2';
import {MIN_PASSWORD_LENGTH} from './constants';

/**
 * Password hashing utilities using Argon2id algorithm.
 * Argon2id is the recommended variant that combines data-independent and data-dependent
 * memory access, providing resistance against both GPU cracking attacks and side-channel attacks.
 */

/**
 * Hash a password using Argon2id with recommended parameters.
 *
 * @param password - The plain text password to hash
 * @returns The hashed password string
 */
export async function hashPassword(password: string): Promise<string> {
  return argon2.hash(password, {
    type: argon2.argon2id,
    // Use recommended defaults for memory cost, time cost, and parallelism
    // These are secure for most applications
  });
}

/**
 * Verify a password against a stored hash.
 *
 * @param password - The plain text password to verify
 * @param hash - The stored hash to verify against
 * @returns true if the password matches, false otherwise
 */
export async function verifyPassword(password: string, hash: string): Promise<boolean> {
  try {
    return await argon2.verify(hash, password);
  } catch {
    // Invalid hash format or verification error
    return false;
  }
}

/**
 * Validate password meets minimum requirements.
 *
 * @param password - The password to validate
 * @returns An error message if invalid, null if valid
 */
export function validatePassword(password: string): string | null {
  if (!password || password.length < MIN_PASSWORD_LENGTH) {
    return `Password must be at least ${MIN_PASSWORD_LENGTH} characters long`;
  }
  return null;
}
