import {getDatabaseUrl, getEmailServerConfig, isPasswordAuthEnabled} from '@/environment';
import {createTransport} from 'nodemailer';
import {NodemailerEmailService, type EmailService} from './core/email-service';
import {ensureDefined} from './core/utils';
import {createEngine, type Engine} from './engine';
import {getGlobalSingleton} from './global-singleton';

export async function getEngineSingleton(): Promise<Engine> {
  return await getGlobalSingleton('engine', async () => {
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
}
