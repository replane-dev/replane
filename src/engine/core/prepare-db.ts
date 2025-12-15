import {Kysely, PostgresDialect} from 'kysely';
import type {Context} from './context';
import type {DB} from './db';
import type {Logger} from './logger';
import {migrate} from './migrations';
import {getPgPool} from './pg-pool-cache';

export interface PrepareDbOptions {
  databaseUrl: string;
  dbSchema: string;
}

export async function prepareDb(ctx: Context, logger: Logger, options: PrepareDbOptions) {
  const [pool, freePool] = getPgPool(options.databaseUrl);

  pool.on('connect', async client => {
    if (options.dbSchema !== 'public') {
      await client.query(
        `CREATE SCHEMA IF NOT EXISTS ${options.dbSchema}; SET search_path TO ${options.dbSchema}`,
      );
    }
  });

  const client = await pool.connect();
  try {
    await migrate(ctx, client, logger, options.dbSchema);
  } finally {
    client.release();
  }

  const dialect = new PostgresDialect({
    pool,
  });

  const db = new Kysely<DB>({dialect}).withSchema(options.dbSchema);

  return {db, pool, freePool};
}

