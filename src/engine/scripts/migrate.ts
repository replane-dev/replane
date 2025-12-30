import {getDatabaseUrl} from '@/environment';
import {type Context, GLOBAL_CONTEXT} from '../core/context';
import {createLogger} from '../core/logger';
import {migrate} from '../core/migrations';
import {createPgPool} from '../core/pg-pool-cache';

async function main(ctx: Context) {
  const logger = createLogger({level: 'info'});

  // create pool with higher limits for migrations
  const pool = createPgPool(getDatabaseUrl(), {
    maxConnections: 10,
    queryTimeout: 15 * 60 * 1000,
    idleTimeoutMillis: 15 * 60 * 1000,
    connectionTimeoutMillis: 3 * 1000,
  });

  try {
    const client = await pool.connect();
    logger.info(ctx, {msg: 'Starting migration...'});
    await migrate(ctx, client, logger, 'public').finally(() => {
      client.release();
    });
    logger.info(ctx, {msg: 'Migration finished.'});

    return 0;
  } catch (error) {
    console.error('Migration failed:', error);

    return 1;
  } finally {
    pool.end();
  }
}

main(GLOBAL_CONTEXT)
  .then(code => {
    process.exit(code);
  })
  .catch(error => {
    console.error(error);
    process.exit(1);
  });
