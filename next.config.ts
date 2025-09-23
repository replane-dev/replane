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
};

export default nextConfig;
