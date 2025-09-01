import type {NextConfig} from 'next';

const nextConfig: NextConfig = {
  redirects: async () => [
    {
      source: '/',
      destination: '/app',
      permanent: false,
    },
    {
      source: '/app',
      destination: '/app/configs',
      permanent: false,
    },
  ],
};

export default nextConfig;
