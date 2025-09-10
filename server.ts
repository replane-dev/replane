// Custom Next.js server that runs DB migrations before accepting traffic.
// This replaces Next.js instrumentation-based migrations.
import next from 'next';
import http from 'node:http';
import 'tsconfig-paths/register';

import {getPgPool} from '@/engine/core/pg-pool-cache';
import {GLOBAL_CONTEXT} from './src/engine/core/context';
import {createLogger} from './src/engine/core/logger';
import {migrate} from './src/engine/core/migrations';
import {getDatabaseUrl} from './src/engine/engine-singleton';

async function runMigrations() {
  const ctx = GLOBAL_CONTEXT;
  const logger = createLogger({level: 'info'});

  const databaseUrl = getDatabaseUrl();
  const dbSchema = process.env.DB_SCHEMA || 'public';

  const [pool, free] = getPgPool(databaseUrl);

  logger.info(ctx, {msg: 'Server: ensuring database is migrated before startup...'});
  try {
    const client = await pool.connect();
    try {
      if (dbSchema !== 'public') {
        await client.query(`CREATE SCHEMA IF NOT EXISTS ${dbSchema}`);
      }
      await client.query(`set search_path to ${dbSchema}`);
      await migrate(ctx, client, logger, dbSchema);
      logger.info(ctx, {msg: 'Server: migrations up to date.'});
    } finally {
      client.release();
    }
  } catch (error) {
    logger.error(ctx, {msg: 'Server: migration failed', error});
    throw error;
  } finally {
    free();
  }
}

async function main() {
  const dev = process.env.NODE_ENV !== 'production';
  const hostname = '0.0.0.0';
  const port = parseInt(process.env.PORT || '3000', 10);

  // 1) Run migrations first to ensure schema is ready
  await runMigrations();

  // 2) Prepare and start Next.js server
  const app = next({dev, hostname, port});
  const handle = app.getRequestHandler();
  await app.prepare();

  const server = http.createServer((req, res) => {
    // Let Next handle all routes
    handle(req, res);
  });

  server.listen(port, hostname, () => {
    // eslint-disable-next-line no-console
    console.log(`> Ready on http://${hostname}:${port}`);
  });
}

main().catch(err => {
  // eslint-disable-next-line no-console
  console.error('Fatal startup error:', err);
  process.exit(1);
});
