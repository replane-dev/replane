import assert from 'assert';
import {ClientBase} from 'pg';
import type {Context} from './context';
import type {Logger} from './logger';

export interface Migration {
  sql: string;
}

export const migrations: Migration[] = [
  {
    sql: /*sql*/ `
      CREATE TABLE verification_token
      (
        identifier TEXT NOT NULL,
        expires TIMESTAMPTZ NOT NULL,
        token TEXT NOT NULL,

        PRIMARY KEY (identifier, token)
      );

      CREATE TABLE accounts
      (
        id SERIAL,
        "userId" INTEGER NOT NULL,
        type VARCHAR(255) NOT NULL,
        provider VARCHAR(255) NOT NULL,
        "providerAccountId" VARCHAR(255) NOT NULL,
        refresh_token TEXT,
        access_token TEXT,
        expires_at BIGINT,
        id_token TEXT,
        scope TEXT,
        session_state TEXT,
        token_type TEXT,

        PRIMARY KEY (id)
      );

      CREATE TABLE sessions
      (
        id SERIAL,
        "userId" INTEGER NOT NULL,
        expires TIMESTAMPTZ NOT NULL,
        "sessionToken" VARCHAR(255) NOT NULL,

        PRIMARY KEY (id)
      );

      CREATE TABLE users
      (
        id SERIAL,
        name VARCHAR(255),
        email VARCHAR(255),
        "emailVerified" TIMESTAMPTZ,
        image TEXT,

        PRIMARY KEY (id)
      );
    `,
  },
  {
    sql: /*sql*/ `
      CREATE TABLE configs (
        id UUID PRIMARY KEY,
        name TEXT NOT NULL UNIQUE,
        value JSONB NOT NULL,
        description TEXT NOT NULL,
        schema JSONB NULL,
        creator_id INT NOT NULL REFERENCES users(id) ON DELETE SET NULL,
        created_at TIMESTAMPTZ(3) NOT NULL,
        updated_at TIMESTAMPTZ(3) NOT NULL,
        version INT NOT NULL
      );

      CREATE UNIQUE INDEX idx_configs_name ON configs(name);
      CREATE INDEX idx_configs_creator_id ON configs(creator_id);

      CREATE TYPE config_user_role AS ENUM (
        'owner',
        'editor',
        'viewer'
      );

      CREATE TABLE config_users (
        config_id UUID NOT NULL REFERENCES configs(id) ON DELETE CASCADE,
        user_email_normalized VARCHAR(255) NOT NULL,
        role config_user_role NOT NULL,
        PRIMARY KEY (config_id, user_email_normalized)
      );

      CREATE INDEX idx_config_users_user_email_normalized ON config_users(user_email_normalized);

      CREATE TABLE api_tokens (
        id UUID PRIMARY KEY,
        creator_id INT NOT NULL REFERENCES users(id) ON DELETE SET NULL,
        token_hash TEXT NOT NULL UNIQUE,
        created_at TIMESTAMPTZ(3) NOT NULL,
        name TEXT NOT NULL,
        description TEXT NOT NULL
      );

      CREATE INDEX idx_api_tokens_token_hash ON api_tokens(token_hash);
      CREATE INDEX idx_api_tokens_creator_id ON api_tokens(creator_id);

      CREATE TABLE config_versions (
        id UUID PRIMARY KEY,
        config_id UUID NOT NULL REFERENCES configs(id) ON DELETE CASCADE,
        name TEXT NOT NULL,
        version INT NOT NULL,
        description TEXT NOT NULL,
        value JSONB NOT NULL,
        schema JSONB NULL,
        created_at TIMESTAMPTZ(3) NOT NULL,
        author_id INT NULL REFERENCES users(id) ON DELETE SET NULL
      );

      CREATE UNIQUE INDEX idx_config_versions_config_id_version ON config_versions(config_id, version);
      CREATE INDEX idx_config_versions_author_id ON config_versions(author_id);

      CREATE TABLE audit_messages (
        id UUID PRIMARY KEY,
        user_id INT NULL REFERENCES users(id) ON DELETE SET NULL,
        config_id UUID NULL REFERENCES configs(id) ON DELETE SET NULL,
        payload JSONB NOT NULL,
        created_at TIMESTAMPTZ(3) NOT NULL
      );

      CREATE INDEX idx_audit_messages_user_id ON audit_messages (user_id);
      CREATE INDEX idx_audit_messages_config_id ON audit_messages (config_id);
      CREATE INDEX idx_audit_messages_created_at_id ON audit_messages (created_at DESC, id DESC);
    `,
  },
];

export async function migrate(ctx: Context, client: ClientBase, logger: Logger, schema: string) {
  // Acquire an advisory lock to ensure only one migrator runs at a time for this DB session
  await client.query(/*sql*/ `SELECT pg_advisory_lock(hashtext('migrations_${schema}'));`);
  try {
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

    logger.info(ctx, {msg: 'Run migrations count: ' + runMigrations.length});

    assert(
      runMigrations.length <= migrations.length,
      `Unexpected number of run migrations: ${runMigrations.length} > ${migrations.length}`,
    );

    logger.info(ctx, {
      msg: 'Not run migrations count: ' + (migrations.length - runMigrations.length),
    });

    for (let i = 0; i < runMigrations.length; i++) {
      assert(
        runMigrations[i].sql === migrations[i].sql,
        `Migration ${i} is out of sync: ${runMigrations[i].sql} !== ${migrations[i].sql}`,
      );
    }

    for (let i = runMigrations.length; i < migrations.length; i++) {
      logger.info(ctx, {msg: `Running migration ${i}: ${migrations[i].sql}`});
      try {
        // Run each migration in its own SERIALIZABLE transaction
        await client.query('BEGIN TRANSACTION ISOLATION LEVEL SERIALIZABLE');
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
        await client.query('COMMIT');
      } catch (error) {
        await client.query('ROLLBACK');
        throw new Error(`Failed to insert migration ${i}`, {cause: error});
      }
    }
  } finally {
    // Always release the advisory lock even if an error occurs
    await client.query(/*sql*/ `SELECT pg_advisory_unlock(hashtext('migrations'));`);
  }
}
