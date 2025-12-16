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
