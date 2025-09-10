import {type Context, GLOBAL_CONTEXT} from '../core/context';
import {createLogger} from '../core/logger';
import {migrate} from '../core/migrations';
import {getPgPool} from '../core/pg-pool-cache';
import {getDatabaseUrl} from '../engine-singleton';

async function main(ctx: Context) {
  const logger = createLogger({level: 'info'});

  const [pool, free] = getPgPool(getDatabaseUrl());

  try {
    const client = await pool.connect();
    logger.info(ctx, {msg: 'Starting migration...'});
    await migrate(ctx, client, logger, 'public').finally(() => {
      client.release();
    });
  } catch (error) {
    console.error('Migration failed:', error);
  } finally {
    logger.info(ctx, {msg: 'Migration finished.'});
    free();
  }
}

main(GLOBAL_CONTEXT).catch(console.error);
