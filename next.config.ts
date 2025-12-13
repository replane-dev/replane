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

  // Route browser requests to Sentry through a Next.js rewrite to circumvent ad-blockers
  tunnelRoute: true,

  // Automatically tree-shake Sentry logger statements to reduce bundle size
  disableLogger: true,

  // Disable source map upload - we ship them publicly so Sentry can fetch them
  sourcemaps: {
    disable: true,
  },
});
