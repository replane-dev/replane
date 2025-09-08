import {Pool} from 'pg';
import {type Context, GLOBAL_CONTEXT} from '../core/context';
import {createLogger} from '../core/logger';
import {migrate} from '../core/migrations';
import {getDatabaseUrl} from '../engine-singleton';

async function main(ctx: Context) {
  const logger = createLogger({level: 'info'});

  const pool = new Pool({
    connectionString: getDatabaseUrl(),
    max: 50,
    idleTimeoutMillis: 30000,
    connectionTimeoutMillis: 2000,
  });

  try {
    const client = await pool.connect();
    logger.info(ctx, {msg: 'Starting migration...'});
    await migrate(ctx, client, logger).finally(() => {
      client.release();
    });
  } catch (error) {
    console.error('Migration failed:', error);
  } finally {
    logger.info(ctx, {msg: 'Migration finished.'});
    pool.end();
  }
}

main(GLOBAL_CONTEXT).catch(console.error);
