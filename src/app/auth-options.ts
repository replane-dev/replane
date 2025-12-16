import {MAGIC_LINK_MAX_AGE_SECONDS} from '@/engine/core/constants';
import {GLOBAL_CONTEXT} from '@/engine/core/context';
import {createLogger} from '@/engine/core/logger';
import {getPgPool} from '@/engine/core/pg-pool-cache';
import {ensureDefined, normalizeEmail} from '@/engine/core/utils';
import {getDatabaseUrl, getEngineSingleton} from '@/engine/engine-singleton';
import {isEmailDomainAllowed} from '@/lib/email-domain-validator';
import {getEmailServerConfig, isMagicLinkAuthEnabled} from '@/lib/email-server-config';
import PostgresAdapter from '@auth/pg-adapter';
import * as Sentry from '@sentry/nextjs';
import {type AuthOptions} from 'next-auth';
import EmailProvider from 'next-auth/providers/email';
import GithubProvider from 'next-auth/providers/github';
import GitlabProvider from 'next-auth/providers/gitlab';
import GoogleProvider, {type GoogleProfile} from 'next-auth/providers/google';
import OktaProvider from 'next-auth/providers/okta';

// Lazily construct AuthOptions at request-time to avoid requiring DB env at build-time
let cached: AuthOptions | null = null;

export function getAuthOptions(): AuthOptions {
  if (cached) return cached;

  const databaseUrl = getDatabaseUrl(); // throws only when actually needed at runtime
  const [pool, freePool] = getPgPool(databaseUrl);
  const logger = createLogger({level: 'info'});

  (['SIGINT', 'SIGTERM'] as const).forEach(signal => {
    process.on(signal, freePool);
  });

  cached = {
    // Important: use JWT session strategy so middleware can authorize via getToken
    session: {strategy: 'jwt'},
    jwt: {
      maxAge: MAGIC_LINK_MAX_AGE_SECONDS,
    },
    // Provide a stable secret so both middleware (edge) and server can verify tokens
    secret: ensureDefined(process.env.NEXTAUTH_SECRET, 'NEXTAUTH_SECRET is not defined'),
    adapter: PostgresAdapter(pool),
    pages: {
      signIn: '/auth/signin',
      signOut: '/auth/signout',
      error: '/auth/error',
    },
    providers: [
      // Email provider (magic link) - requires MAGIC_LINK_ENABLED=true and email server configuration
      (() => {
        if (!isMagicLinkAuthEnabled()) {
          return [];
        }
        const emailConfig = getEmailServerConfig();
        if (!emailConfig) {
          return [];
        }
        return [
          EmailProvider({
            server: {
              host: emailConfig.host,
              port: emailConfig.port,
              auth:
                emailConfig.user && emailConfig.password
                  ? {
                      user: emailConfig.user,
                      pass: emailConfig.password,
                    }
                  : undefined,
            },
            maxAge: 24 * 60 * 60, // 24 hours
            from: emailConfig.from,
            sendVerificationRequest: async ({identifier, url}) => {
              const {host} = new URL(url);

              const engine = await getEngineSingleton();
              if (!engine.mail) {
                throw new Error('Email service is not configured');
              }

              await engine.mail.sendMagicLink({
                to: identifier,
                url,
                host,
              });
            },
          }),
        ];
      })(),
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
              allowDangerousEmailAccountLinking: true,
            }),
          ]
        : [],
      process.env.GITLAB_CLIENT_ID || process.env.GITLAB_CLIENT_SECRET
        ? [
            GitlabProvider({
              clientId: ensureDefined(
                process.env.GITLAB_CLIENT_ID,
                'GITLAB_CLIENT_ID is not defined',
              ),
              clientSecret: ensureDefined(
                process.env.GITLAB_CLIENT_SECRET,
                'GITLAB_CLIENT_SECRET is not defined',
              ),
              allowDangerousEmailAccountLinking: true,
            }),
          ]
        : [],
      process.env.GOOGLE_CLIENT_ID || process.env.GOOGLE_CLIENT_SECRET
        ? [
            GoogleProvider({
              clientId: ensureDefined(
                process.env.GOOGLE_CLIENT_ID,
                'GOOGLE_CLIENT_ID is not defined',
              ),
              clientSecret: ensureDefined(
                process.env.GOOGLE_CLIENT_SECRET,
                'GOOGLE_CLIENT_SECRET is not defined',
              ),
              allowDangerousEmailAccountLinking: true,
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
              allowDangerousEmailAccountLinking: true,
            }),
          ]
        : [],
    ].flat(),
    callbacks: {
      async signIn({account, profile, user}) {
        try {
          // Check email domain restrictions
          const email = user?.email || (profile as any)?.email;
          if (!isEmailDomainAllowed(email)) {
            logger.warn(GLOBAL_CONTEXT, {
              msg: 'Sign-in blocked: email domain not allowed',
              email,
              provider: account?.provider,
            });
            // Return a redirect to the error page with AccessDenied error
            return '/auth/error?error=AccessDenied';
          }

          // Provider-specific validations
          if (account?.provider === 'google') {
            return !!(profile as GoogleProfile | undefined)?.email_verified;
          }
          return true;
        } catch (error) {
          Sentry.captureException(error, {
            extra: {provider: account?.provider, event: 'signIn'},
          });
          throw error;
        }
      },
    },
    events: {
      async createUser({user}) {
        try {
          // TODO: don't create user if initUser fails
          const userEmail = normalizeEmail(user.email ?? 'unknown@replane.dev');
          const engine = await getEngineSingleton();
          await engine.useCases.initUser(GLOBAL_CONTEXT, {
            userEmail,
            exampleProject: true,
          });
        } catch (error) {
          Sentry.captureException(error, {
            extra: {event: 'createUser'},
          });
          throw error;
        }
      },
    },
  } satisfies AuthOptions;

  return cached;
}
