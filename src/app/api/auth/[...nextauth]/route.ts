import {getPgPool} from '@/engine/core/pg-pool-cache';
import {ensureDefined} from '@/engine/core/utils';
import PostgresAdapter from '@auth/pg-adapter';
import NextAuth, {AuthOptions} from 'next-auth';
import GithubProvider from 'next-auth/providers/github';

const [pool, freePool] = getPgPool(ensureDefined(process.env.DATABASE_URL, 'DATABASE_URL is not defined'));

(['SIGINT', 'SIGTERM'] as const).forEach(signal => {
  process.on(signal, freePool);
});

export const authOptions: AuthOptions = {
  // Important: use JWT session strategy so middleware can authorize via getToken
  session: {strategy: 'jwt'},
  jwt: {
    maxAge: 24 * 60 * 60, // 24 hours
  },
  // Provide a stable secret so both middleware (edge) and server can verify tokens
  secret: ensureDefined(process.env.NEXTAUTH_SECRET, 'NEXTAUTH_SECRET is not defined'),
  adapter: PostgresAdapter(pool),
  providers: [
    GithubProvider({
      clientId: ensureDefined(process.env.GITHUB_CLIENT_ID, 'GITHUB_CLIENT_ID is not defined'),
      clientSecret: ensureDefined(process.env.GITHUB_CLIENT_SECRET, 'GITHUB_CLIENT_SECRET is not defined'),
    }),
  ],
};

const handler = NextAuth(authOptions);

export {handler as GET, handler as POST};
