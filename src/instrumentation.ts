import * as Sentry from '@sentry/nextjs';

export async function register() {
  if (process.env.NEXT_RUNTIME === 'nodejs') {
    const {init} = await import('./init-node-environment');
    await init();
  } else {
    throw new Error(`Unsupported NEXT_RUNTIME: ${process.env.NEXT_RUNTIME}`);
  }
}

export const onRequestError = Sentry.captureRequestError;
