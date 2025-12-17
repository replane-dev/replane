import '../sentry.server.config';

import 'next-logger';

import {getEmailServerConfig} from '@/lib/email-server-config';

if (!process.env.BASE_URL) {
  throw new Error('BASE_URL is not defined');
}
if (!process.env.SECRET_KEY_BASE) {
  throw new Error('SECRET_KEY_BASE is not defined');
}

if (process.env.MAGIC_LINK_ENABLED === 'true') {
  const emailServerConfig = getEmailServerConfig();
  if (!emailServerConfig) {
    throw new Error(
      'Magic link authentication is enabled but email server configuration is not defined, see https://github.com/replane-dev/replane/blob/main/README.md',
    );
  }
}

process.env.NEXTAUTH_SECRET = process.env.SECRET_KEY_BASE;
process.env.NEXTAUTH_URL = process.env.BASE_URL;
