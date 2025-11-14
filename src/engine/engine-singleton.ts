import {Lazy} from '@/engine/core/lazy';
import {ensureDefined, getOrganizationConfig, joinUndefined} from './core/utils';
import {createEngine, type Engine} from './engine';

export const getDatabaseUrl = () =>
  ensureDefined(
    process.env.DATABASE_URL ??
      joinUndefined(
        'postgres://',
        process.env.DATABASE_USER,
        ':',
        process.env.DATABASE_PASSWORD,
        '@',
        process.env.DATABASE_HOST,
        ':',
        process.env.DATABASE_PORT,
        '/',
        process.env.DATABASE_NAME,
      ),
    'DATABASE_URL or DATABASE_USER, DATABASE_PASSWORD, DATABASE_HOST, DATABASE_PORT, DATABASE_NAME env vars must be defined',
  );

// Shared singleton so TRPC and Hono reuse the same engine instance per process.
export const engineLazy = new Lazy(async () => {
  const orgConfig = getOrganizationConfig();
  return await createEngine({
    databaseUrl: getDatabaseUrl(),
    dbSchema: process.env.DB_SCHEMA || 'public',
    logLevel: 'info',
    requireProposals: orgConfig.requireProposals,
    allowSelfApprovals: orgConfig.allowSelfApprovals,
  });
});

export async function getEngineSingleton(): Promise<Engine> {
  return engineLazy.get();
}
