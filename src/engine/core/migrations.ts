import assert from 'assert';
import {ClientBase} from 'pg';
import type {Context} from './context';
import type {Logger} from './logger';

export interface Migration {
  sql: string;
}

const EXAMPLE_PROJECT_ID = '32234b32-b7d9-4401-91e2-745a0cfb092a';
const EXAMPLE_USER_ID = 123456789;

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
  {
    // add projects
    sql: /*sql*/ `
      CREATE TABLE projects (
        id UUID PRIMARY KEY,
        name TEXT NOT NULL,
        description TEXT NOT NULL,
        is_example BOOLEAN NOT NULL DEFAULT FALSE,
        created_at TIMESTAMPTZ(3) NOT NULL,
        updated_at TIMESTAMPTZ(3) NOT NULL
      );

      INSERT INTO projects (id, name, description, is_example, created_at, updated_at)
      SELECT '${EXAMPLE_PROJECT_ID}', 'Example project', 'This is an example project.', TRUE, NOW(), NOW();

      ALTER TABLE configs
      ADD COLUMN project_id UUID NULL REFERENCES projects(id) ON DELETE CASCADE;

      UPDATE configs
      SET project_id = (SELECT id FROM projects ORDER BY created_at ASC LIMIT 1)
      WHERE project_id IS NULL;

      ALTER TABLE configs
      ALTER COLUMN project_id SET NOT NULL;

      CREATE INDEX idx_configs_project_id ON configs(project_id);

      ALTER TABLE api_tokens
      ADD COLUMN project_id UUID NULL REFERENCES projects(id) ON DELETE CASCADE;

      UPDATE api_tokens
      SET project_id = (SELECT id FROM projects ORDER BY created_at ASC LIMIT 1)
      WHERE project_id IS NULL;

      ALTER TABLE api_tokens
      ALTER COLUMN project_id SET NOT NULL;

      CREATE INDEX idx_api_tokens_project_id ON api_tokens(project_id);

      ALTER TABLE audit_messages
      ADD COLUMN project_id UUID NULL REFERENCES projects(id) ON DELETE CASCADE;

      UPDATE audit_messages
      SET project_id = (SELECT id FROM projects ORDER BY created_at ASC LIMIT 1)
      WHERE project_id IS NULL;

      ALTER TABLE audit_messages
      ALTER COLUMN project_id SET NOT NULL;

      CREATE INDEX idx_audit_messages_project_id ON audit_messages(project_id);

      CREATE TYPE project_user_role AS ENUM (
        'owner', -- can manage the project, users, configs, and api tokens
        'admin' -- can manage configs and api tokens
      );

      CREATE TABLE project_users (
        project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
        user_email_normalized VARCHAR(255) NOT NULL,
        role project_user_role NOT NULL,
        created_at TIMESTAMPTZ(3) NOT NULL,
        updated_at TIMESTAMPTZ(3) NOT NULL,
        PRIMARY KEY (project_id, user_email_normalized)
      );

      CREATE INDEX idx_project_users_user_email_normalized ON project_users(user_email_normalized);
      CREATE INDEX idx_project_users_project_id ON project_users(project_id);

      INSERT INTO project_users (project_id, user_email_normalized, role, created_at, updated_at)
      SELECT (SELECT id FROM projects LIMIT 1), LOWER(u.email), 'owner', NOW(), NOW()
      FROM users u
      WHERE u.email IS NOT NULL;

      ALTER TABLE config_users ADD COLUMN created_at TIMESTAMPTZ(3) NOT NULL DEFAULT NOW();
      ALTER TABLE config_users ADD COLUMN updated_at TIMESTAMPTZ(3) NOT NULL DEFAULT NOW();
      ALTER TABLE config_users ALTER COLUMN created_at DROP DEFAULT;
      ALTER TABLE config_users ALTER COLUMN updated_at DROP DEFAULT;

      -- example configs

      INSERT INTO users (id, name, email, "emailVerified")
      VALUES (${EXAMPLE_USER_ID}, 'Example User', 'example-user@replane.dev', NOW());

      INSERT INTO configs (id, name, value, description, schema, creator_id, created_at, updated_at, version, project_id)
      VALUES
      (
        gen_random_uuid(),
        'example_config',
        '{ "value": {"key":"value"} }'::JSONB,
        'This is an example config demonstrating JSON Schema support.',
        '{"value":{"$schema":"http://json-schema.org/draft-07/schema#","type":"object","properties":{"key":{"type":"string"}},"required":["key"]}}'::JSONB,
        ${EXAMPLE_USER_ID},
        NOW(),
        NOW(),
        1,
        '${EXAMPLE_PROJECT_ID}'
      ),
      (
        gen_random_uuid(),
        'example_feature_enabled',
        '{ "value": true }'::JSONB,
        'This is a feature flag config. Supports all JSON Schema versions (draft-04, draft-06, draft-07, 2019-09, 2020-12).',
        '{"value":{"$schema":"http://json-schema.org/draft-07/schema#","type":"boolean"}}'::JSONB,
        ${EXAMPLE_USER_ID},
        NOW(),
        NOW(),
        1,
        '${EXAMPLE_PROJECT_ID}'
      );
    `,
  },
  {
    sql: /*sql*/ `
      ALTER TABLE audit_messages
      DROP CONSTRAINT IF EXISTS audit_messages_project_id_fkey,
      ADD CONSTRAINT audit_messages_project_id_fkey
      FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE SET NULL;

      ALTER TABLE audit_messages
      ALTER COLUMN project_id DROP NOT NULL;
    `,
  },
  {
    sql: /*sql*/ `
      CREATE TABLE config_proposals (
        id UUID PRIMARY KEY,
        config_id UUID NOT NULL REFERENCES configs(id) ON DELETE CASCADE,
        base_config_version INT NOT NULL,
        proposer_id INT NULL REFERENCES users(id) ON DELETE SET NULL,
        created_at TIMESTAMPTZ(3) NOT NULL,
        rejected_at TIMESTAMPTZ(3) NULL,
        approved_at TIMESTAMPTZ(3) NULL,
        reviewer_id INT NULL REFERENCES users(id) ON DELETE SET NULL,
        rejected_in_favor_of_proposal_id UUID NULL REFERENCES config_proposals(id) ON DELETE SET NULL,
        proposed_value JSONB NULL,
        proposed_description TEXT NULL,
        proposed_schema JSONB NULL
      );

      CREATE INDEX idx_config_proposals_config_id ON config_proposals(config_id, base_config_version);
      CREATE INDEX idx_config_proposals_proposer_id ON config_proposals(proposer_id);
      CREATE INDEX idx_config_proposals_reviewer_id ON config_proposals(reviewer_id);
      CREATE INDEX idx_config_proposals_rejected_in_favor_of_proposal_id ON config_proposals(rejected_in_favor_of_proposal_id);
    `,
  },
  {
    sql: /*sql*/ `
      -- add proposal_id to config_versions
      ALTER TABLE config_versions
      ADD COLUMN proposal_id UUID NULL REFERENCES config_proposals(id) ON DELETE SET NULL;

      CREATE INDEX idx_config_versions_proposal_id ON config_versions(proposal_id);
    `,
  },
  {
    sql: /*sql*/ `
      -- add proposed_delete flag to config_proposals to support deletion proposals
      ALTER TABLE config_proposals
      ADD COLUMN proposed_delete BOOLEAN NOT NULL DEFAULT FALSE;
    `,
  },
  {
    sql: /*sql*/ `
      -- add proposed_members to config_proposals to support membership changes via proposals
      ALTER TABLE config_proposals
      ADD COLUMN proposed_members JSONB NULL;
    `,
  },
  {
    sql: /*sql*/ `
      -- drop unique config index and create project_id, name index
      DROP INDEX IF EXISTS idx_configs_name;
      CREATE UNIQUE INDEX idx_configs_project_id_name ON configs(project_id, name);
    `,
  },
  {
    sql: /*sql*/ `
      ALTER TABLE configs
      DROP CONSTRAINT IF EXISTS configs_name_key;
    `,
  },
  {
    sql: /*sql*/ `
      -- add rejection_reason to config_proposals to track why a proposal was rejected
      CREATE TYPE config_proposal_rejection_reason AS ENUM (
        'config_edited',
        'config_deleted',
        'another_proposal_approved',
        'rejected_explicitly'
      );

      ALTER TABLE config_proposals
      ADD COLUMN rejection_reason config_proposal_rejection_reason NULL;
    `,
  },
  {
    sql: /*sql*/ `
      -- create separate table for config version members
      CREATE TABLE config_version_members (
        config_version_id UUID NOT NULL REFERENCES config_versions(id) ON DELETE CASCADE,
        user_email_normalized TEXT NOT NULL,
        role config_user_role NOT NULL,
        PRIMARY KEY (config_version_id, user_email_normalized)
      );

      CREATE INDEX idx_config_version_members_version_id ON config_version_members(config_version_id);
    `,
  },
  {
    sql: /*sql*/ `
      -- Remove 'viewer' role from config_user_role enum
      -- Step 1: Create new enum without 'viewer'
      CREATE TYPE config_user_role_v2 AS ENUM ('owner', 'editor');

      -- Step 2: Delete all config_users with role = 'viewer'
      DELETE FROM config_users WHERE role = 'viewer';

      -- Step 3: Change column types to use the new enum
      ALTER TABLE config_users
        ALTER COLUMN role TYPE config_user_role_v2 USING role::text::config_user_role_v2;

      ALTER TABLE config_version_members
        ALTER COLUMN role TYPE config_user_role_v2 USING role::text::config_user_role_v2;

      -- Step 4: Drop the old enum
      DROP TYPE config_user_role;

      -- Step 5: Rename the new enum to the original name
      ALTER TYPE config_user_role_v2 RENAME TO config_user_role;
    `,
  },
  {
    sql: /*sql*/ `
      -- Add message column to config_proposals for proposal descriptions
      ALTER TABLE config_proposals
      ADD COLUMN message TEXT NULL;
    `,
  },
  {
    sql: /*sql*/ `
      -- Add overrides column to configs table for conditional value overrides
      ALTER TABLE configs
      ADD COLUMN overrides JSONB NULL;

      -- Add overrides column to config_versions table for version history
      ALTER TABLE config_versions
      ADD COLUMN overrides JSONB NULL;

      -- Add proposed_overrides column to config_proposals table for override proposals
      ALTER TABLE config_proposals
      ADD COLUMN proposed_overrides JSONB NULL;
    `,
  },
  {
    sql: /*sql*/ `
      -- Unified three-tier role system migration
      -- Project: 'owner' → 'admin', 'admin' → 'maintainer'
      -- Config: 'owner' → 'maintainer'

      -- Step 1: Update project_user_role enum
      CREATE TYPE project_user_role_v2 AS ENUM ('admin', 'maintainer');

      -- Update existing project_users data
      ALTER TABLE project_users
        ALTER COLUMN role TYPE TEXT;

      UPDATE project_users SET role = 'maintainer' WHERE role = 'admin';
      UPDATE project_users SET role = 'admin' WHERE role = 'owner';

      ALTER TABLE project_users
        ALTER COLUMN role TYPE project_user_role_v2 USING role::text::project_user_role_v2;

      DROP TYPE project_user_role;
      ALTER TYPE project_user_role_v2 RENAME TO project_user_role;

      -- Step 2: Update config_user_role enum
      CREATE TYPE config_user_role_v3 AS ENUM ('maintainer', 'editor');

      -- Update existing config_users data
      ALTER TABLE config_users
        ALTER COLUMN role TYPE TEXT;

      UPDATE config_users SET role = 'maintainer' WHERE role = 'owner';
      -- 'editor' stays as 'editor'

      ALTER TABLE config_users
        ALTER COLUMN role TYPE config_user_role_v3 USING role::text::config_user_role_v3;

      -- Update config_version_members data
      ALTER TABLE config_version_members
        ALTER COLUMN role TYPE TEXT;

      UPDATE config_version_members SET role = 'maintainer' WHERE role = 'owner';
      -- 'editor' stays as 'editor'

      ALTER TABLE config_version_members
        ALTER COLUMN role TYPE config_user_role_v3 USING role::text::config_user_role_v3;

      DROP TYPE config_user_role;
      ALTER TYPE config_user_role_v3 RENAME TO config_user_role;
    `,
  },
  {
    sql: /*sql*/ `
      -- Convert JSONB columns to TEXT columns
      -- Migrate configs table
      ALTER TABLE configs
        ALTER COLUMN value TYPE TEXT USING COALESCE((value->'value')::TEXT, value::TEXT),
        ALTER COLUMN schema TYPE TEXT USING CASE WHEN schema IS NULL THEN NULL ELSE COALESCE((schema->'value')::TEXT, schema::TEXT) END,
        ALTER COLUMN overrides TYPE TEXT USING CASE WHEN overrides IS NULL THEN NULL ELSE COALESCE((overrides->'value')::TEXT, overrides::TEXT) END;

      -- Migrate config_versions table
      ALTER TABLE config_versions
        ALTER COLUMN value TYPE TEXT USING COALESCE((value->'value')::TEXT, value::TEXT),
        ALTER COLUMN schema TYPE TEXT USING CASE WHEN schema IS NULL THEN NULL ELSE COALESCE((schema->'value')::TEXT, schema::TEXT) END,
        ALTER COLUMN overrides TYPE TEXT USING CASE WHEN overrides IS NULL THEN NULL ELSE COALESCE((overrides->'value')::TEXT, overrides::TEXT) END;

      -- Migrate config_proposals table
      ALTER TABLE config_proposals
        ALTER COLUMN proposed_value TYPE TEXT USING CASE WHEN proposed_value IS NULL THEN NULL ELSE COALESCE((proposed_value->'value')::TEXT, proposed_value::TEXT) END,
        ALTER COLUMN proposed_schema TYPE TEXT USING CASE WHEN proposed_schema IS NULL THEN NULL ELSE COALESCE((proposed_schema->'value')::TEXT, proposed_schema::TEXT) END,
        ALTER COLUMN proposed_overrides TYPE TEXT USING CASE WHEN proposed_overrides IS NULL THEN NULL ELSE COALESCE((proposed_overrides->'value')::TEXT, proposed_overrides::TEXT) END,
        ALTER COLUMN proposed_members TYPE TEXT USING CASE WHEN proposed_members IS NULL THEN NULL ELSE COALESCE((proposed_members->'value')::TEXT, proposed_members::TEXT) END;

      -- Migrate audit_messages table
      ALTER TABLE audit_messages
        ALTER COLUMN payload TYPE TEXT USING COALESCE((payload->'value')::TEXT, payload::TEXT);
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
        console.error(`Error running migration ${i}:`, error);
        await client.query('ROLLBACK');
        throw new Error(`Failed to insert migration ${i}`, {cause: error});
      }
    }
  } finally {
    // Always release the advisory lock even if an error occurs
    await client.query(/*sql*/ `SELECT pg_advisory_unlock(hashtext('migrations_${schema}'));`);
  }
}
