import {ensureDefined, joinUndefined} from './engine/core/utils';

type AuthProvider = 'credentials' | 'email' | 'github' | 'gitlab' | 'google' | 'okta';

export function getEnabledAuthProviders(): AuthProvider[] {
  const providers: AuthProvider[] = [];
  if (isPasswordAuthEnabled()) {
    providers.push('credentials');
  }
  if (isMagicLinkAuthEnabled()) {
    providers.push('email');
  }
  if (process.env.GITHUB_CLIENT_ID || process.env.GITHUB_CLIENT_SECRET) {
    providers.push('github');
  }
  if (process.env.GITLAB_CLIENT_ID || process.env.GITLAB_CLIENT_SECRET) {
    providers.push('gitlab');
  }
  if (process.env.GOOGLE_CLIENT_ID || process.env.GOOGLE_CLIENT_SECRET) {
    providers.push('google');
  }
  if (process.env.OKTA_CLIENT_ID || process.env.OKTA_CLIENT_SECRET || process.env.OKTA_ISSUER) {
    providers.push('okta');
  }

  if (
    providers.length === 0 &&
    !['false', 'no', '0'].includes(process.env.PASSWORD_AUTH_ENABLED?.toLowerCase() ?? '')
  ) {
    providers.push('credentials');
  }

  return providers;
}

/**
 * Checks if password-based authentication is enabled.
 * Controlled by PASSWORD_AUTH_ENABLED environment variable.
 *
 * @returns true if email/password authentication should be enabled
 */
export function isPasswordAuthEnabled(): boolean {
  return process.env.PASSWORD_AUTH_ENABLED === 'true';
}

/**
 * Email server configuration utilities.
 * Supports both connection string format (EMAIL_SERVER) and individual variables.
 */

export interface EmailServerConfig {
  host: string;
  port: number;
  user?: string;
  password?: string;
  from: string;
}

/**
 * Parses EMAIL_SERVER connection string or builds from individual variables.
 *
 * Supports two formats:
 *
 * 1. Connection string:
 *    EMAIL_SERVER=smtp://username:password@smtp.example.com:587
 *    EMAIL_FROM=noreply@example.com
 *
 * 2. Individual variables:
 *    EMAIL_SERVER_HOST=smtp.example.com
 *    EMAIL_SERVER_PORT=587
 *    EMAIL_SERVER_USER=username
 *    EMAIL_SERVER_PASSWORD=password
 *    EMAIL_FROM=noreply@example.com
 *
 * @returns EmailServerConfig if configured, null otherwise
 */
export function getEmailServerConfig(): EmailServerConfig | null {
  const emailFrom = process.env.EMAIL_FROM;
  if (!emailFrom) {
    return null;
  }

  // Try connection string format first (EMAIL_SERVER)
  const emailServer = process.env.EMAIL_SERVER;
  if (emailServer) {
    try {
      const url = new URL(emailServer);

      return {
        host: url.hostname,
        port: url.port ? parseInt(url.port) : 587,
        user: url.username || undefined,
        password: url.password || undefined,
        from: emailFrom,
      };
    } catch (error) {
      throw new Error(
        `Invalid EMAIL_SERVER format: ${emailServer}. Expected format: smtp://username:password@smtp.example.com:587`,
      );
    }
  }

  // Try individual variables format
  const host = process.env.EMAIL_SERVER_HOST;
  const port = process.env.EMAIL_SERVER_PORT;
  const user = process.env.EMAIL_SERVER_USER;
  const password = process.env.EMAIL_SERVER_PASSWORD;

  if (host && port) {
    return {
      host,
      port: parseInt(port),
      user: user || undefined,
      password: password || undefined,
      from: emailFrom,
    };
  }

  return null;
}

/**
 * Checks if email server is configured.
 *
 * @returns true if email server configuration is available
 */
export function isEmailServerConfigured(): boolean {
  return getEmailServerConfig() !== null;
}

/**
 * Checks if magic link authentication is enabled.
 * Requires both email server configuration AND MAGIC_LINK_ENABLED=true.
 *
 * @returns true if magic link authentication should be enabled
 */
export function isMagicLinkAuthEnabled(): boolean {
  return process.env.MAGIC_LINK_ENABLED === 'true' && isEmailServerConfigured();
}

/**
 * DATABASE_URL or DATABASE_USER, DATABASE_PASSWORD, DATABASE_HOST, DATABASE_PORT, DATABASE_NAME env vars must be defined
 *
 * @returns the database URL
 */
export const getDatabaseUrl = () =>
  ensureDefined(
    process.env.DATABASE_URL ??
      joinUndefined(
        'postgres://',
        process.env.DATABASE_USER,
        ':',
        process.env.DATABASE_PASSWORD,
        '@',
        process.env.DATABASE_HOST,
        ':',
        process.env.DATABASE_PORT,
        '/',
        process.env.DATABASE_NAME,
      ),
    'DATABASE_URL or DATABASE_USER, DATABASE_PASSWORD, DATABASE_HOST, DATABASE_PORT, DATABASE_NAME env vars must be defined',
  );

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

/**
 * Gets the healthcheck path from environment variables.
 *
 * @returns the healthcheck path, or undefined if not configured
 */
export function getHealthcheckPath(): string | undefined {
  const path = process.env.HEALTHCHECK_PATH;
  if (!path) {
    return '/api/health';
  }
  return path.startsWith('/') ? path : `/${path}`;
}

/**
 * Gets the port from environment variables.
 *
 * @returns the port, or 8080 if not configured
 */
export function getPort(): number {
  return parseInt(process.env.PORT || '8080', 10);
}

/**
 * Checks if the environment is development.
 *
 * @returns true if the environment is development, false otherwise
 */
export function isDevelopment(): boolean {
  return process.env.NODE_ENV !== 'production';
}

/**
 * Checks if user registration is disabled.
 * Controlled by DISABLE_REGISTRATION environment variable.
 *
 * When enabled, new user signups are blocked. Existing users can still sign in.
 * Useful for private instances or when you want to manage users manually.
 *
 * @returns true if registration is disabled, false otherwise
 */
export function isRegistrationDisabled(): boolean {
  return process.env.DISABLE_REGISTRATION === 'true';
}

/**
 * Gets the superuser API key from environment variables.
 * The superuser API key bypasses all permission checks and allows any operation.
 *
 * @returns the superuser API key, or undefined if not configured
 */
export function getSuperuserApiKey(): string | undefined {
  return process.env.SUPERUSER_API_KEY;
}
