// This file configures the initialization of Sentry on the client.
// The config you add here will be used whenever a user loads a page in their browser.
// https://docs.sentry.io/platforms/javascript/guides/nextjs/

import * as Sentry from '@sentry/nextjs';

// Read config from runtime-injected global (set in layout.tsx)
// This allows SENTRY_DSN to be provided at container start, not build time
declare global {
  interface Window {
    __SENTRY_CONFIG__?: {
      dsn: string;
      environment: string;
      tracesSampleRate: string;
    };
  }
}

const config = typeof window !== 'undefined' ? window.__SENTRY_CONFIG__ : undefined;

if (config?.dsn) {
  Sentry.init({
    dsn: config.dsn,

    environment: config.environment,

    sendDefaultPii: true,

    // Set tracesSampleRate to 1.0 to capture 100% of transactions for performance monitoring.
    // Adjust this value in production.
    tracesSampleRate: parseFloat(config.tracesSampleRate || '0.1'),

    // Setting this option to true will print useful information to the console while you're setting up Sentry.
    debug: false,

    // Enable replay to capture session replays (optional)
    replaysOnErrorSampleRate: 1.0,
    replaysSessionSampleRate: 0.1,

    integrations: [
      Sentry.replayIntegration({
        // Mask all text content and block all media by default for privacy
        maskAllText: true,
        blockAllMedia: true,
      }),
      Sentry.feedbackIntegration({
        // Configure feedback integration
        colorScheme: 'system',
        autoInject: false, // We'll use our custom dialog instead of the default widget
      }),
    ],
  });
}

export const onRouterTransitionStart = Sentry.captureRouterTransitionStart;
