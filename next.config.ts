import {withSentryConfig} from '@sentry/nextjs';
import type {NextConfig} from 'next';

const nextConfig: NextConfig = {
  output: 'standalone',
  productionBrowserSourceMaps: true,
  experimental: {
    serverSourceMaps: true,
  },
  redirects: async () => [
    {
      source: '/',
      destination: '/app',
      permanent: false,
    },
    {
      source: '/app/projects',
      destination: '/app',
      permanent: false,
    },
  ],
  turbopack: {},
  serverExternalPackages: ['pino', 'pino-pretty', 'thread-stream', '@sentry/node-native'],
};

export default withSentryConfig(nextConfig, {
  // Route browser requests to Sentry through our custom server to circumvent ad-blockers
  tunnelRoute: '/api/internal/monitoring',

  telemetry: false,

  sourcemaps: {
    disable: false,
  },

  widenClientFileUpload: true,

  authToken: process.env.SENTRY_AUTH_TOKEN,
});
