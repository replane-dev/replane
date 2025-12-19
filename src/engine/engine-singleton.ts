import {Lazy} from '@/engine/core/lazy';
import {getEmailServerConfig} from '@/lib/email-server-config';
import {createTransport} from 'nodemailer';
import {NodemailerEmailService, type EmailService} from './core/email-service';
import {ensureDefined, joinUndefined} from './core/utils';
import {createEngine, type Engine} from './engine';

/**
 * Checks if password-based authentication is enabled.
 * Controlled by PASSWORD_AUTH_ENABLED environment variable.
 *
 * @returns true if email/password authentication should be enabled
 */
export function isPasswordAuthEnabled(): boolean {
  return process.env.PASSWORD_AUTH_ENABLED === 'true';
}

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

// Shared singleton so TRPC and other services reuse the same engine instance per process.
export const engineLazy = new Lazy(async () => {
  // Create email service if configured
  let emailService: EmailService | undefined = undefined;
  const emailConfig = getEmailServerConfig();
  if (emailConfig) {
    const transport = createTransport({
      host: emailConfig.host,
      port: emailConfig.port,
      auth:
        emailConfig.user && emailConfig.password
          ? {
              user: emailConfig.user,
              pass: emailConfig.password,
            }
          : undefined,
    });
    const transportVerified = await transport.verify();
    if (!transportVerified) {
      // helpful user friendly error message
      throw new Error(
        'Failed to verify email transport. Please check your email server configuration.',
      );
    }
    emailService = new NodemailerEmailService(transport, emailConfig.from);
  }

  const baseUrl = ensureDefined(process.env.BASE_URL, 'BASE_URL is not defined');

  const engine = await createEngine({
    databaseUrl: getDatabaseUrl(),
    dbSchema: process.env.DB_SCHEMA || 'public',
    logLevel: 'info',
    emailService,
    baseUrl,
    passwordAuthEnabled: isPasswordAuthEnabled(),
  });

  return engine;
});

export async function getEngineSingleton(): Promise<Engine> {
  return engineLazy.get();
}
