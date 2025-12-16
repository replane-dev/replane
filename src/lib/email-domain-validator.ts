/**
 * Email domain validation utilities for controlling user registration.
 *
 * This module provides functions to validate email domains against a whitelist
 * configured via the ALLOWED_EMAIL_DOMAINS environment variable.
 */

/**
 * Gets the list of allowed email domains from environment variables.
 *
 * @returns Array of allowed domains, or null if no restrictions are configured
 *
 * @example
 * // ALLOWED_EMAIL_DOMAINS="gmail.com,my-company.com"
 * getAllowedEmailDomains() // ['gmail.com', 'my-company.com']
 *
 * @example
 * // ALLOWED_EMAIL_DOMAINS not set
 * getAllowedEmailDomains() // null
 */
export function getAllowedEmailDomains(): string[] | null {
  const allowedDomains = process.env.ALLOWED_EMAIL_DOMAINS;

  if (!allowedDomains) {
    return null;
  }

  return allowedDomains
    .split(',')
    .map(domain => domain.trim().toLowerCase())
    .filter(domain => domain.length > 0);
}

/**
 * Validates if an email domain is allowed based on ALLOWED_EMAIL_DOMAINS environment variable.
 * If ALLOWED_EMAIL_DOMAINS is not set, all domains are allowed.
 *
 * @param email - The email address to validate
 * @returns true if the email domain is allowed, false otherwise
 *
 * @example
 * // ALLOWED_EMAIL_DOMAINS="gmail.com,my-company.com"
 * isEmailDomainAllowed('user@gmail.com') // true
 * isEmailDomainAllowed('user@my-company.com') // true
 * isEmailDomainAllowed('user@other.com') // false
 *
 * @example
 * // ALLOWED_EMAIL_DOMAINS not set
 * isEmailDomainAllowed('user@any-domain.com') // true
 */
export function isEmailDomainAllowed(email: string | null | undefined): boolean {
  if (!email) {
    return false;
  }

  const allowedDomains = getAllowedEmailDomains();

  // If no restriction is set, allow all domains
  if (!allowedDomains) {
    return true;
  }

  // Extract domain from email
  const emailDomain = email.toLowerCase().split('@')[1];
  if (!emailDomain) {
    return false;
  }

  return allowedDomains.includes(emailDomain);
}

/**
 * Checks if email domain restrictions are enabled.
 *
 * @returns true if restrictions are configured, false otherwise
 */
export function hasEmailDomainRestrictions(): boolean {
  return getAllowedEmailDomains() !== null;
}
