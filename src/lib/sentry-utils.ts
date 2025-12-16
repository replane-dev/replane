/**
 * Sentry utility functions for checking integration status.
 */

/**
 * Checks if Sentry is enabled by verifying the presence of Sentry configuration.
 * 
 * @returns true if Sentry DSN is configured, false otherwise
 * 
 * @example
 * if (isSentryEnabled()) {
 *   // Show feedback button
 * }
 */
export function isSentryEnabled(): boolean {
  return typeof window !== 'undefined' && !!window.__SENTRY_CONFIG__?.dsn;
}

