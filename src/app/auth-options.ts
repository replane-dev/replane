import {GLOBAL_CONTEXT} from '@/engine/core/context';
import {DefaultDateProvider} from '@/engine/core/date-provider';
import type {DB} from '@/engine/core/db';
import {EventHubPublisher} from '@/engine/core/event-hub';
import {createLogger, type Logger} from '@/engine/core/logger';
import {getPgPool} from '@/engine/core/pg-pool-cache';
import {AuditLogStore} from '@/engine/core/stores/audit-log-store';
import {ConfigStore} from '@/engine/core/stores/config-store';
import {ConfigVariantStore} from '@/engine/core/stores/config-variant-store';
import {ProjectEnvironmentStore} from '@/engine/core/stores/project-environment-store';
import {ProjectStore} from '@/engine/core/stores/project-store';
import {ProjectUserStore} from '@/engine/core/stores/project-user-store';
import {WorkspaceMemberStore} from '@/engine/core/stores/workspace-member-store';
import {WorkspaceStore} from '@/engine/core/stores/workspace-store';
import {createWorkspace} from '@/engine/core/use-cases/create-workspace-use-case';
import {UserStore} from '@/engine/core/user-store';
import {ensureDefined, normalizeEmail, runTransactional} from '@/engine/core/utils';
import {getDatabaseUrl} from '@/engine/engine-singleton';
import {isEmailDomainAllowed} from '@/lib/email-domain-validator';
import PostgresAdapter from '@auth/pg-adapter';
import * as Sentry from '@sentry/nextjs';
import {Kysely, PostgresDialect} from 'kysely';
import {type AuthOptions, type User} from 'next-auth';
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

  const dbSchema = process.env.DB_SCHEMA || 'public';
  const dialect = new PostgresDialect({pool});
  const db = new Kysely<DB>({dialect}).withSchema(dbSchema);

  cached = {
    // Important: use JWT session strategy so middleware can authorize via getToken
    session: {strategy: 'jwt'},
    jwt: {
      maxAge: 24 * 60 * 60, // 24 hours
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
          await initUser(db, user, logger);
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

async function initUser(db: Kysely<DB>, user: User, logger: Logger) {
  await runTransactional({
    ctx: GLOBAL_CONTEXT,
    db,
    logger,
    onConflictRetriesCount: 16,
    fn: async (_ctx, tx) => {
      const workspaceStore = new WorkspaceStore(tx);
      const workspaceMemberStore = new WorkspaceMemberStore(tx);
      const projectStore = new ProjectStore(tx);
      const projectUserStore = new ProjectUserStore(tx);
      const projectEnvironmentStore = new ProjectEnvironmentStore(tx);
      const configs = new ConfigStore(
        tx,
        new EventHubPublisher(tx, logger, new DefaultDateProvider()),
      );
      const configVariants = new ConfigVariantStore(tx);
      await createWorkspace({
        currentUserEmail: normalizeEmail(user.email ?? 'unknown@replane.dev'),
        name: {type: 'personal'},
        workspaceStore,
        workspaceMemberStore,
        projectStore,
        projectUserStore,
        projectEnvironmentStore,
        users: new UserStore(tx),
        auditLogs: new AuditLogStore(tx),
        now: new Date(),
        configs,
        configVariants,
        exampleProject: true,
      });

      // Auto-add new users to workspaces that have auto_add_new_users enabled
      if (!user.email) {
        return;
      }

      // Get workspaces that auto-add new users
      const workspaces = await tx
        .selectFrom('workspaces')
        .selectAll()
        .where('auto_add_new_users', '=', true)
        .execute();

      // Add user as member to those workspaces
      const now = new Date();
      const normalizedEmail = normalizeEmail(user.email);

      for (const org of workspaces) {
        // Check if already a member
        const existingMember = await workspaceMemberStore.getByWorkspaceIdAndEmail({
          workspaceId: org.id,
          userEmail: normalizedEmail,
        });

        if (!existingMember) {
          await workspaceMemberStore.create([
            {
              workspaceId: org.id,
              email: user.email,
              role: 'member',
              createdAt: now,
              updatedAt: now,
            },
          ]);
        }
      }
    },
  });
}
