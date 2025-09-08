import {getPgPool} from '@/engine/core/pg-pool-cache';
import {ensureDefined} from '@/engine/core/utils';
import {getDatabaseUrl} from '@/engine/engine-singleton';
import PostgresAdapter from '@auth/pg-adapter';
import {type AuthOptions} from 'next-auth';
import GithubProvider from 'next-auth/providers/github';
import OktaProvider from 'next-auth/providers/okta';

const [pool, freePool] = getPgPool(getDatabaseUrl());

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
    process.env.GITHUB_CLIENT_ID || process.env.GITHUB_CLIENT_SECRET
      ? [
          GithubProvider({
            clientId: ensureDefined(
              process.env.GITHUB_CLIENT_ID,
              'GITHUB_CLIENT_ID is not defined',
            ),
            clientSecret: ensureDefined(
              process.env.GITHUB_CLIENT_SECRET,
              'GITHUB_CLIENT_SECRET is not defined',
            ),
          }),
        ]
      : [],
    process.env.OKTA_CLIENT_ID || process.env.OKTA_CLIENT_SECRET || process.env.OKTA_ISSUER
      ? [
          OktaProvider({
            clientId: ensureDefined(process.env.OKTA_CLIENT_ID, 'OKTA_CLIENT_ID is not defined'),
            clientSecret: ensureDefined(
              process.env.OKTA_CLIENT_SECRET,
              'OKTA_CLIENT_SECRET is not defined',
            ),
            issuer: ensureDefined(process.env.OKTA_ISSUER, 'OKTA_ISSUER is not defined'),
          }),
        ]
      : [],
  ].flat(),
};
