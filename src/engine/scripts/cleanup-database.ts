/* eslint-disable no-console */

// This is intended for local development only to cleanup database schemas used for testing

import {Client} from 'pg';
import {getDatabaseUrl} from '../engine-singleton';

async function main() {
  const client = new Client({
    connectionString: getDatabaseUrl(),
    connectionTimeoutMillis: 2000,
  });

  try {
    await client.connect();

    // Find all test schemas
    const res = await client.query<{
      schema_name: string;
    }>(`SELECT schema_name FROM information_schema.schemata WHERE schema_name LIKE 'test_%';`);

    if (res.rows.length === 0) {
      console.log('No test schemas found to clean up.');
      return;
    }

    console.log(`Found ${res.rows.length} test schema(s) to clean up.`);

    // Drop each test schema
    for (const row of res.rows) {
      console.log(`Dropping schema ${row.schema_name}...`);
      await client.query(`DROP SCHEMA IF EXISTS ${row.schema_name} CASCADE;`);
    }

    console.log('Database cleanup completed successfully.');
  } catch (error) {
    console.error('Error during database cleanup:', error);
    throw error;
  } finally {
    await client.end();
  }
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
