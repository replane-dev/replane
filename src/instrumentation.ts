import * as Sentry from '@sentry/nextjs';

export async function register() {
  await import('./init-node-environment');
}

export const onRequestError = Sentry.captureRequestError;
