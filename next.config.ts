import {withSentryConfig} from '@sentry/nextjs';
import type {NextConfig} from 'next';

const nextConfig: NextConfig = {
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
  serverExternalPackages: ['pino', 'pino-pretty', 'thread-stream'],
};

export default withSentryConfig(nextConfig, {
  // Automatically annotate React components to show their full name in breadcrumbs and session replay
  reactComponentAnnotation: {
    enabled: true,
  },

  // Route browser requests to Sentry through our custom server to circumvent ad-blockers
  tunnelRoute: '/api/internal/monitoring',

  // Automatically tree-shake Sentry logger statements to reduce bundle size
  disableLogger: true,

  sourcemaps: {
    disable: false,
  },

  widenClientFileUpload: true,
});
