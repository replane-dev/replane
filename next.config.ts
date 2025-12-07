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

export default nextConfig;
