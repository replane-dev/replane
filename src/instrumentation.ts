import {GLOBAL_CONTEXT} from '@/engine/core/context';
import {createLogger} from '@/engine/core/logger';

// This runs once per server process startup in Next.js.
// We use it to ensure DB migrations are applied before the app starts handling requests.
export async function register() {
  if (process.env.NEXT_RUNTIME !== 'nodejs') {
    throw new Error('Instrumentation: unsupported NEXT_RUNTIME ' + process.env.NEXT_RUNTIME);
  }

  const {migrate} = await import('@/engine/core/migrations');
  const {getDatabaseUrl} = await import('@/engine/engine-singleton');
  const {Pool} = await import('pg');

  const ctx = GLOBAL_CONTEXT;
  const logger = createLogger({level: 'info'});
  const databaseUrl = getDatabaseUrl();
  const dbSchema = process.env.DB_SCHEMA || 'public';

  const pool = new Pool({
    connectionString: databaseUrl,
    max: 50,
    idleTimeoutMillis: 30000,
    connectionTimeoutMillis: 2000,
  });

  logger.info(ctx, {msg: 'Instrumentation: ensuring database is migrated before startup...'});

  try {
    const client = await pool.connect();
    try {
      if (dbSchema !== 'public') {
        await client.query(`CREATE SCHEMA IF NOT EXISTS ${dbSchema}`);
      }
      await client.query(`set search_path to ${dbSchema}`);
      await migrate(ctx, client, logger, dbSchema);
      logger.info(ctx, {msg: 'Instrumentation: migrations up to date.'});
    } finally {
      client.release();
    }
  } catch (error) {
    logger.error(ctx, {msg: 'Instrumentation: migration failed', error});
    // Rethrow to fail startup; safer than serving without schema
    throw error;
  } finally {
    await pool.end();
  }
}
