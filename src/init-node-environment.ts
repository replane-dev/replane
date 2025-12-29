import '../sentry.server.config';

import 'next-logger';

import {getEmailServerConfig} from '@/environment';
import {getEdgeSingleton} from './engine/edge-singleton';
import {getEngineSingleton} from './engine/engine-singleton';

if (!process.env.BASE_URL) {
  throw new Error('BASE_URL is not defined');
}
if (!process.env.SECRET_KEY) {
  throw new Error('SECRET_KEY is not defined');
}

if (process.env.MAGIC_LINK_ENABLED === 'true') {
  const emailServerConfig = getEmailServerConfig();
  if (!emailServerConfig) {
    throw new Error(
      'Magic link authentication is enabled but email server configuration is not defined, see https://github.com/replane-dev/replane/blob/main/README.md',
    );
  }
}

process.env.NEXTAUTH_SECRET = process.env.SECRET_KEY;
process.env.NEXTAUTH_URL = process.env.BASE_URL;

['SIGINT', 'SIGTERM'].forEach(signal => {
  process.on(signal, () => {
    console.log('Received signal', signal);
    setTimeout(() => {
      process.exit(0);
    }, 5000).unref();
  });
});

export async function init() {
  console.log('Initializing Replane...');
  await getEngineSingleton();
  await getEdgeSingleton();
  console.log('Replane initialized');
}
