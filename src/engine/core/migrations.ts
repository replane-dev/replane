import assert from 'node:assert';
import {ClientBase} from 'pg';

export interface Migration {
  sql: string;
}

export const migrations: Migration[] = [
  {
    sql: /*sql*/ `
      CREATE TABLE configs (
        id UUID PRIMARY KEY,
        name TEXT NOT NULL UNIQUE,
        value JSONB NOT NULL,
        created_at TIMESTAMPTZ(3) NOT NULL,
        updated_at TIMESTAMPTZ(3) NOT NULL,
        version INT NOT NULL
      );

      CREATE INDEX idx_configs_name ON configs(name);
    `,
  },
];

export async function migrate(client: ClientBase) {
  await client.query(/*sql*/ `
    CREATE TABLE IF NOT EXISTS migrations (
      id INT PRIMARY KEY,
      sql TEXT NOT NULL UNIQUE,
      runAt TIMESTAMPTZ(3) NOT NULL
    );
  `);

  const {rows: runMigrations} = await client.query<{id: number; sql: string}>(/*sql*/ `
    SELECT id, sql FROM migrations ORDER BY id ASC
  `);

  console.log('Run migrations count:', runMigrations.length);

  assert(
    runMigrations.length <= migrations.length,
    `Unexpected number of run migrations: ${runMigrations.length} > ${migrations.length}`,
  );

  console.log('Not run migrations count:', migrations.length - runMigrations.length);

  for (let i = 0; i < runMigrations.length; i++) {
    assert(
      runMigrations[i].sql === migrations[i].sql,
      `Migration ${i} is out of sync: ${runMigrations[i].sql} !== ${migrations[i].sql}`,
    );
  }

  for (let i = runMigrations.length; i < migrations.length; i++) {
    console.log(`Running migration ${i}: ${migrations[i].sql}`);
    try {
      await client.query('BEGIN;');
      const {rows: newMigration} = await client.query<{id: number}>(
        /*sql*/ `
          INSERT INTO migrations (id, sql, runAt)
          VALUES ($1, $2, $3)
          RETURNING id;
        `,
        [i + 1, migrations[i].sql, new Date()],
      );
      await client.query(migrations[i].sql);

      assert(newMigration.length === 1, `Failed to insert migration ${i}`);
      await client.query('COMMIT;');
    } catch (error) {
      await client.query('ROLLBACK;');
      throw new Error(`Failed to insert migration ${i}`, {cause: error});
    }
  }
}
