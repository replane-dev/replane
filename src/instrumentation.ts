import * as Sentry from '@sentry/nextjs';

export async function register() {
  if (process.env.NEXT_RUNTIME !== 'nodejs') {
    throw new Error(`Unsupported NEXT_RUNTIME: ${process.env.NEXT_RUNTIME}`);
  }

  const {init} = await import('./init-node-environment');
  await init();
}

export const onRequestError = Sentry.captureRequestError;
