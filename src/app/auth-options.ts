import {GLOBAL_CONTEXT} from '@/engine/core/context';
import type {DB} from '@/engine/core/db';
import {createLogger, type Logger} from '@/engine/core/logger';
import {OrganizationMemberStore} from '@/engine/core/organization-member-store';
import {
  createOrganizationId,
  Organization,
  OrganizationStore,
} from '@/engine/core/organization-store';
import {getPgPool} from '@/engine/core/pg-pool-cache';
import {ProjectEnvironmentStore} from '@/engine/core/project-environment-store';
import {createProjectId, Project, ProjectStore} from '@/engine/core/project-store';
import {ProjectUserStore} from '@/engine/core/project-user-store';
import {
  ensureDefined,
  normalizeEmail,
  runTransactional,
  shouldAutoAddToOrganizations,
} from '@/engine/core/utils';
import {createUuidV7} from '@/engine/core/uuid';
import {getDatabaseUrl} from '@/engine/engine-singleton';
import PostgresAdapter from '@auth/pg-adapter';
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
      async signIn({account, profile}) {
        if (account?.provider === 'google') {
          return !!(profile as GoogleProfile | undefined)?.email_verified;
        }
        return true;
      },
    },
    events: {
      async createUser({user}) {
        // TODO: don't create user if initUser fails
        await initUser(db, user, logger);
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
      const organizationStore = new OrganizationStore(tx);
      const organizationMemberStore = new OrganizationMemberStore(tx);
      const projectStore = new ProjectStore(tx);
      const projectUserStore = new ProjectUserStore(tx);
      const projectEnvironmentStore = new ProjectEnvironmentStore(tx);

      const personalOrganization: Organization = {
        id: createOrganizationId(),
        name: 'Personal',
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      await organizationStore.create(personalOrganization);
      await organizationMemberStore.create([
        {
          organizationId: personalOrganization.id,
          email: normalizeEmail(user.email ?? 'unknown@replane.dev'),
          role: 'admin',
          createdAt: new Date(),
          updatedAt: new Date(),
        },
      ]);
      const project: Project = {
        id: createProjectId(),
        name: 'Personal',
        description: 'This is your personal project.',
        organizationId: personalOrganization.id,
        requireProposals: false,
        allowSelfApprovals: false,
        createdAt: new Date(),
        updatedAt: new Date(),
        isExample: false,
      };
      await projectStore.create(project);
      await projectUserStore.create([
        {
          projectId: project.id,
          email: normalizeEmail(user.email ?? 'unknown@replane.dev'),
          role: 'admin',
          createdAt: new Date(),
          updatedAt: new Date(),
        },
      ]);
      await projectEnvironmentStore.create({
        projectId: project.id,
        name: 'Production',
        order: 1,
        createdAt: new Date(),
        updatedAt: new Date(),
        id: createUuidV7(),
      });
      await projectEnvironmentStore.create({
        projectId: project.id,
        name: 'Development',
        order: 2,
        createdAt: new Date(),
        updatedAt: new Date(),
        id: createUuidV7(),
      });

      // Auto-add new users to all organizations if enabled
      if (!shouldAutoAddToOrganizations() || !user.email) {
        return;
      }

      // Get all organizations (raw SQL query since user is just being created)
      const organizations = await tx.selectFrom('organizations').selectAll().execute();

      // Add user as member to all organizations
      const now = new Date();
      const normalizedEmail = normalizeEmail(user.email);

      for (const org of organizations) {
        // Check if already a member
        const existingMember = await organizationMemberStore.getByOrganizationIdAndEmail({
          organizationId: org.id,
          userEmail: normalizedEmail,
        });

        if (!existingMember) {
          await organizationMemberStore.create([
            {
              organizationId: org.id,
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
