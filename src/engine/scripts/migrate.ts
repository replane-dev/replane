import {Pool} from 'pg';
import {migrate} from '../core/migrations';

async function main() {
  const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    max: 50,
    idleTimeoutMillis: 30000,
    connectionTimeoutMillis: 2000,
  });

  try {
    const client = await pool.connect();
    console.log('Starting migration...');
    await migrate(client).finally(() => {
      client.release();
    });
  } catch (error) {
    console.error('Migration failed:', error);
  } finally {
    console.log('Migration finished.');
    pool.end();
  }
}

main().catch(console.error);
