import {Lazy} from '@/engine/core/lazy';
import {createEngine, type Engine} from './engine';

// Shared singleton so TRPC and Hono reuse the same engine instance per process.
export const engineLazy = new Lazy(async () => {
  return await createEngine({
    databaseUrl: process.env.DATABASE_URL!,
    dbSchema: process.env.DB_SCHEMA || 'public',
    logLevel: 'info',
  });
});

export async function getEngineSingleton(): Promise<Engine> {
  return engineLazy.get();
}
