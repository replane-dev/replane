// This file configures the initialization of Sentry on the server.
// The config you add here will be used whenever the server handles a request.
// https://docs.sentry.io/platforms/javascript/guides/nextjs/

import * as Sentry from '@sentry/nextjs';

const SENTRY_DSN = process.env.SENTRY_DSN;

if (SENTRY_DSN) {
  Sentry.init({
    dsn: SENTRY_DSN,

    environment: process.env.SENTRY_ENVIRONMENT || process.env.NODE_ENV,

    // Capture 2% of transactions by default to limit performance-monitoring volume.
    tracesSampleRate: parseFloat(process.env.SENTRY_TRACES_SAMPLE_RATE || '0.02'),

    // Setting this option to true will print useful information to the console while you're setting up Sentry.
    debug: false,

    integrations: [Sentry.zodErrorsIntegration()],
  });
}
