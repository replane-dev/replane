import assert from 'assert';
import {ClientBase} from 'pg';
import type {Context} from './context';
import type {Logger} from './logger';

export interface Migration {
  sql: string;
}

const EXAMPLE_PROJECT_ID = '32234b32-b7d9-4401-91e2-745a0cfb092a';
const EXAMPLE_USER_ID = 123456789;
const DEFAULT_ORGANIZATION_ID = '32234b32-b7d9-4401-91e2-745a0cfb092b';

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
  {
    sql: /*sql*/ `
      -- Major refactor: Introduce environments and restructure schema

      -- Step 1: Create project_environments table
      CREATE TABLE project_environments (
        id UUID PRIMARY KEY,
        project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
        name TEXT NOT NULL,
        created_at TIMESTAMPTZ(3) NOT NULL,
        updated_at TIMESTAMPTZ(3) NOT NULL,
        UNIQUE(project_id, name)
      );

      CREATE INDEX idx_project_environments_project_id ON project_environments(project_id);

      -- Step 2: Insert Production and Development environments for each project
      INSERT INTO project_environments (id, project_id, name, created_at, updated_at)
      SELECT
        gen_random_uuid(),
        p.id,
        'Production',
        NOW(),
        NOW()
      FROM projects p;

      INSERT INTO project_environments (id, project_id, name, created_at, updated_at)
      SELECT
        gen_random_uuid(),
        p.id,
        'Development',
        NOW(),
        NOW()
      FROM projects p;

      -- Step 3: Rename api_tokens to sdk_keys
      ALTER TABLE api_tokens RENAME TO sdk_keys;
      ALTER INDEX idx_api_tokens_token_hash RENAME TO idx_sdk_keys_token_hash;
      ALTER INDEX idx_api_tokens_creator_id RENAME TO idx_sdk_keys_creator_id;
      ALTER INDEX idx_api_tokens_project_id RENAME TO idx_sdk_keys_project_id;

      -- Step 4: Rename audit_messages to audit_logs and add nullable environment_id
      ALTER TABLE audit_messages RENAME TO audit_logs;
      ALTER INDEX idx_audit_messages_user_id RENAME TO idx_audit_logs_user_id;
      ALTER INDEX idx_audit_messages_config_id RENAME TO idx_audit_logs_config_id;
      ALTER INDEX idx_audit_messages_created_at_id RENAME TO idx_audit_logs_created_at_id;
      ALTER INDEX idx_audit_messages_project_id RENAME TO idx_audit_logs_project_id;

      -- Add nullable environment_id to audit_logs (set to Production for existing records)
      ALTER TABLE audit_logs ADD COLUMN environment_id UUID NULL;

      UPDATE audit_logs al
      SET environment_id = (
        SELECT pe.id
        FROM project_environments pe
        WHERE pe.project_id = al.project_id
        AND pe.name = 'Production'
        LIMIT 1
      )
      WHERE al.project_id IS NOT NULL;

      ALTER TABLE audit_logs ADD CONSTRAINT audit_logs_environment_id_fkey
        FOREIGN KEY (environment_id) REFERENCES project_environments(id) ON DELETE SET NULL;

      CREATE INDEX idx_audit_logs_environment_id ON audit_logs(environment_id);

      -- Step 5: Create config_variants table to hold environment-specific config data
      CREATE TABLE config_variants (
        id UUID PRIMARY KEY,
        config_id UUID NOT NULL REFERENCES configs(id) ON DELETE CASCADE,
        environment_id UUID NOT NULL REFERENCES project_environments(id) ON DELETE CASCADE,
        value TEXT NOT NULL,
        schema TEXT NULL,
        overrides TEXT NOT NULL,
        version INT NOT NULL,
        created_at TIMESTAMPTZ(3) NOT NULL,
        updated_at TIMESTAMPTZ(3) NOT NULL,
        UNIQUE(config_id, environment_id)
      );

      CREATE INDEX idx_config_variants_config_id ON config_variants(config_id);
      CREATE INDEX idx_config_variants_environment_id ON config_variants(environment_id);

      -- Step 6: Migrate existing config data to config_variants
      -- For each existing config, create a variant in the Production environment
      INSERT INTO config_variants (id, config_id, environment_id, value, schema, overrides, version, created_at, updated_at)
      SELECT
        gen_random_uuid(),
        c.id,
        (SELECT pe.id FROM project_environments pe WHERE pe.project_id = c.project_id AND pe.name = 'Production' LIMIT 1),
        c.value,
        c.schema,
        COALESCE(c.overrides, '[]'),
        c.version,
        c.created_at,
        c.updated_at
      FROM configs c;

      -- Also create Development variants (copy from Production)
      INSERT INTO config_variants (id, config_id, environment_id, value, schema, overrides, version, created_at, updated_at)
      SELECT
        gen_random_uuid(),
        c.id,
        (SELECT pe.id FROM project_environments pe WHERE pe.project_id = c.project_id AND pe.name = 'Development' LIMIT 1),
        c.value,
        c.schema,
        COALESCE(c.overrides, '[]'),
        c.version,
        c.created_at,
        c.updated_at
      FROM configs c;

      -- Step 7: Remove migrated columns from configs table
      -- Note: version is kept for optimistic locking on config-level changes
      ALTER TABLE configs DROP COLUMN value;
      ALTER TABLE configs DROP COLUMN schema;
      ALTER TABLE configs DROP COLUMN overrides;
      ALTER TABLE configs DROP COLUMN updated_at;

      -- Step 8: Rename config_versions to config_variant_versions and add config_variant_id
      ALTER TABLE config_versions RENAME TO config_variant_versions;
      ALTER INDEX idx_config_versions_config_id_version RENAME TO idx_config_variant_versions_config_id_version;
      ALTER INDEX idx_config_versions_author_id RENAME TO idx_config_variant_versions_author_id;
      ALTER INDEX idx_config_versions_proposal_id RENAME TO idx_config_variant_versions_proposal_id;

      -- Add config_variant_id FK to config_variant_versions (set to Production variant for existing records)
      ALTER TABLE config_variant_versions ADD COLUMN config_variant_id UUID NULL;

      UPDATE config_variant_versions cvv
      SET config_variant_id = (
        SELECT cv.id
        FROM config_variants cv
        INNER JOIN project_environments pe ON pe.id = cv.environment_id
        WHERE cv.config_id = cvv.config_id
        AND pe.name = 'Production'
        LIMIT 1
      );

      ALTER TABLE config_variant_versions ALTER COLUMN config_variant_id SET NOT NULL;
      ALTER TABLE config_variant_versions ADD CONSTRAINT config_variant_versions_config_variant_id_fkey
        FOREIGN KEY (config_variant_id) REFERENCES config_variants(id) ON DELETE CASCADE;

      CREATE INDEX idx_config_variant_versions_config_variant_id ON config_variant_versions(config_variant_id);

      -- Drop config_id column (now redundant - can get from config_variant)
      ALTER TABLE config_variant_versions DROP COLUMN config_id;

      -- Step 9: Drop config_version_members table
      DROP TABLE config_version_members;

      -- Step 10: Update config_proposals - add members_snapshot, remove variant-specific columns
      -- config_proposals are used for config-level changes (deletion, member management)
      ALTER TABLE config_proposals ADD COLUMN members_snapshot TEXT NOT NULL DEFAULT '[]';

      -- Populate members_snapshot with current members from config_users
      UPDATE config_proposals cp
      SET members_snapshot = (
        SELECT COALESCE(
          jsonb_agg(
            jsonb_build_object('email', user_email_normalized, 'role', role)
            ORDER BY user_email_normalized
          )::TEXT,
          '[]'
        )
        FROM config_users cu
        WHERE cu.config_id = cp.config_id
      );

      -- Remove DEFAULT for future inserts
      ALTER TABLE config_proposals ALTER COLUMN members_snapshot DROP DEFAULT;

      -- Drop variant-specific proposal columns (now in config_variant_proposals)
      ALTER TABLE config_proposals DROP COLUMN proposed_value;
      ALTER TABLE config_proposals DROP COLUMN proposed_schema;
      ALTER TABLE config_proposals DROP COLUMN proposed_overrides;

      -- Step 11: Create config_variant_proposals table for environment-specific changes
      CREATE TABLE config_variant_proposals (
        id UUID PRIMARY KEY,
        config_variant_id UUID NOT NULL REFERENCES config_variants(id) ON DELETE CASCADE,
        base_variant_version INT NOT NULL,
        proposer_id INT NULL REFERENCES users(id) ON DELETE SET NULL,
        created_at TIMESTAMPTZ(3) NOT NULL,
        rejected_at TIMESTAMPTZ(3) NULL,
        approved_at TIMESTAMPTZ(3) NULL,
        reviewer_id INT NULL REFERENCES users(id) ON DELETE SET NULL,
        rejected_in_favor_of_proposal_id UUID NULL REFERENCES config_variant_proposals(id) ON DELETE SET NULL,
        rejection_reason config_proposal_rejection_reason NULL,
        proposed_value TEXT NULL,
        proposed_description TEXT NULL,
        proposed_schema TEXT NULL,
        proposed_overrides TEXT NULL,
        message TEXT NULL
      );

      CREATE INDEX idx_config_variant_proposals_config_variant_id ON config_variant_proposals(config_variant_id);
      CREATE INDEX idx_config_variant_proposals_proposer_id ON config_variant_proposals(proposer_id);
      CREATE INDEX idx_config_variant_proposals_reviewer_id ON config_variant_proposals(reviewer_id);
      CREATE INDEX idx_config_variant_proposals_rejected_in_favor_of_proposal_id ON config_variant_proposals(rejected_in_favor_of_proposal_id);

      -- Step 12: Update config_variant_versions.proposal_id FK to reference config_variant_proposals
      -- First, clear any existing proposal_id values since we're not migrating proposal data
      UPDATE config_variant_versions SET proposal_id = NULL WHERE proposal_id IS NOT NULL;

      ALTER TABLE config_variant_versions DROP CONSTRAINT config_versions_proposal_id_fkey;
      ALTER TABLE config_variant_versions ADD CONSTRAINT config_variant_versions_proposal_id_fkey
        FOREIGN KEY (proposal_id) REFERENCES config_variant_proposals(id) ON DELETE SET NULL;
    `,
  },
  {
    sql: /*sql*/ `
      -- Add environment_id foreign key to sdk_keys
      ALTER TABLE sdk_keys ADD COLUMN environment_id UUID NULL;

      -- Set all existing SDK keys to Production environment
      UPDATE sdk_keys sk
      SET environment_id = (
        SELECT pe.id
        FROM project_environments pe
        WHERE pe.project_id = sk.project_id
        AND pe.name = 'Production'
        LIMIT 1
      );

      -- Make environment_id required
      ALTER TABLE sdk_keys ALTER COLUMN environment_id SET NOT NULL;

      -- Add foreign key constraint
      ALTER TABLE sdk_keys ADD CONSTRAINT sdk_keys_environment_id_fkey
        FOREIGN KEY (environment_id) REFERENCES project_environments(id) ON DELETE CASCADE;

      CREATE INDEX idx_sdk_keys_environment_id ON sdk_keys(environment_id);
    `,
  },
  {
    sql: /*sql*/ `
      -- Rename members_snapshot to original_members and add original_description
      ALTER TABLE config_proposals
      RENAME COLUMN members_snapshot TO original_members;

      ALTER TABLE config_proposals
      ADD COLUMN original_description TEXT NOT NULL DEFAULT '';

      -- Drop default for future inserts
      ALTER TABLE config_proposals
      ALTER COLUMN original_description DROP DEFAULT;
    `,
  },
  {
    sql: /*sql*/ `
      -- Unify config_proposals and config_variant_proposals into a single proposal system
      -- A proposal can now include both config-level changes (description, members, deletion)
      -- and variant-level changes (value, schema, overrides for specific environments)

      -- Step 1: Create config_proposal_variants junction table
      -- This stores variant-specific changes that are part of a proposal
      CREATE TABLE config_proposal_variants (
        id UUID PRIMARY KEY,
        proposal_id UUID NOT NULL REFERENCES config_proposals(id) ON DELETE CASCADE,
        config_variant_id UUID NOT NULL REFERENCES config_variants(id) ON DELETE CASCADE,
        base_variant_version INT NOT NULL,
        proposed_value TEXT NULL,
        proposed_schema TEXT NULL,
        proposed_overrides TEXT NULL,
        UNIQUE(proposal_id, config_variant_id)
      );

      CREATE INDEX idx_config_proposal_variants_proposal_id ON config_proposal_variants(proposal_id);
      CREATE INDEX idx_config_proposal_variants_config_variant_id ON config_proposal_variants(config_variant_id);

      -- Step 2: Update config_variant_versions.proposal_id FK to reference config_proposals
      ALTER TABLE config_variant_versions DROP CONSTRAINT config_variant_versions_proposal_id_fkey;
      ALTER TABLE config_variant_versions ADD CONSTRAINT config_variant_versions_proposal_id_fkey
        FOREIGN KEY (proposal_id) REFERENCES config_proposals(id) ON DELETE SET NULL;

      -- Step 3: Drop the old config_variant_proposals table
      DROP TABLE config_variant_proposals;
    `,
  },
  {
    sql: /*sql*/ `
      -- Add order column to project_environments
      ALTER TABLE project_environments
      ADD COLUMN "order" INTEGER NOT NULL DEFAULT 0;

      -- Set initial order: Production=1, Development=2, others start at 3
      WITH ordered_envs AS (
        SELECT
          id,
          CASE
            WHEN name = 'Production' THEN 1
            WHEN name = 'Development' THEN 2
            ELSE ROW_NUMBER() OVER (PARTITION BY project_id ORDER BY name) + 2
          END as new_order
        FROM project_environments
      )
      UPDATE project_environments
      SET "order" = ordered_envs.new_order
      FROM ordered_envs
      WHERE project_environments.id = ordered_envs.id;

      -- Create index for efficient ordering
      CREATE INDEX idx_project_environments_order ON project_environments(project_id, "order");
    `,
  },
  {
    sql: /*sql*/ `
      -- Add updated_at column to configs table
      ALTER TABLE configs
      ADD COLUMN updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW();

      -- Set initial updated_at to created_at for existing configs
      UPDATE configs
      SET updated_at = created_at;

      -- Remove default for future inserts
      ALTER TABLE configs
      ALTER COLUMN updated_at DROP DEFAULT;

      -- Create index for efficient queries
      CREATE INDEX idx_configs_updated_at ON configs(project_id, updated_at DESC);
    `,
  },
  {
    sql: /*sql*/ `
      -- Add organizations table
      CREATE TABLE organizations (
        id UUID PRIMARY KEY,
        name TEXT NOT NULL,
        require_proposals BOOLEAN NOT NULL DEFAULT FALSE,
        allow_self_approvals BOOLEAN NOT NULL DEFAULT FALSE,
        created_at TIMESTAMPTZ(3) NOT NULL,
        updated_at TIMESTAMPTZ(3) NOT NULL
      );

      CREATE INDEX idx_organizations_name ON organizations(name);
      CREATE INDEX idx_organizations_created_at ON organizations(created_at DESC);

      -- Add organization_id foreign key to projects
      ALTER TABLE projects
      ADD COLUMN organization_id UUID NULL REFERENCES organizations(id) ON DELETE CASCADE;

      -- Create a default organization for existing projects
      INSERT INTO organizations (id, name, require_proposals, allow_self_approvals, created_at, updated_at)
      SELECT
        '${DEFAULT_ORGANIZATION_ID}',
        'Default Organization',
        FALSE,
        FALSE,
        NOW(),
        NOW()
      WHERE EXISTS (SELECT 1 FROM projects);

      -- Assign all existing projects to the default organization
      UPDATE projects
      SET organization_id = (SELECT id FROM organizations ORDER BY created_at ASC LIMIT 1)
      WHERE organization_id IS NULL;

      -- Make organization_id required
      ALTER TABLE projects
      ALTER COLUMN organization_id SET NOT NULL;

      CREATE INDEX idx_projects_organization_id ON projects(organization_id);

      -- Create organization_members table
      CREATE TYPE organization_member_role AS ENUM ('admin', 'member');

      CREATE TABLE organization_members (
        organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
        user_email_normalized VARCHAR(255) NOT NULL,
        role organization_member_role NOT NULL,
        created_at TIMESTAMPTZ(3) NOT NULL,
        updated_at TIMESTAMPTZ(3) NOT NULL,
        PRIMARY KEY (organization_id, user_email_normalized)
      );

      CREATE INDEX idx_organization_members_user_email_normalized ON organization_members(user_email_normalized);
      CREATE INDEX idx_organization_members_organization_id ON organization_members(organization_id);

      -- Add all existing users as members of the default organization
      INSERT INTO organization_members (organization_id, user_email_normalized, role, created_at, updated_at)
      SELECT
        (SELECT id FROM organizations ORDER BY created_at ASC LIMIT 1),
        LOWER(TRIM(email)),
        'member',
        NOW(),
        NOW()
      FROM users
      WHERE email IS NOT NULL AND EXISTS (SELECT 1 FROM organizations);
    `,
  },
  {
    sql: /*sql*/ `
      -- Migration 27: Move governance settings from organizations to projects

      -- Add governance columns to projects table
      ALTER TABLE projects
      ADD COLUMN require_proposals BOOLEAN NOT NULL DEFAULT FALSE,
      ADD COLUMN allow_self_approvals BOOLEAN NOT NULL DEFAULT FALSE;

      -- Copy governance settings from organizations to their projects
      UPDATE projects p
      SET
        require_proposals = o.require_proposals,
        allow_self_approvals = o.allow_self_approvals
      FROM organizations o
      WHERE p.organization_id = o.id;

      -- Remove governance columns from organizations table
      ALTER TABLE organizations
      DROP COLUMN require_proposals,
      DROP COLUMN allow_self_approvals;

      -- Remove defaults from projects table
      ALTER TABLE projects
      ALTER COLUMN require_proposals DROP DEFAULT;
      ALTER TABLE projects
      ALTER COLUMN allow_self_approvals DROP DEFAULT;
    `,
  },
  {
    sql: /*sql*/ `
      -- Add personal_org_user_id column to organizations for personal organizations
      ALTER TABLE organizations
      ADD COLUMN personal_org_user_id INTEGER NULL REFERENCES users(id) ON DELETE CASCADE;

      -- Create unique index to ensure one personal org per user
      CREATE UNIQUE INDEX idx_organizations_personal_user_id
        ON organizations(personal_org_user_id)
        WHERE personal_org_user_id IS NOT NULL;

      -- Create personal organizations for all existing users who don't have one
      INSERT INTO organizations (id, name, personal_org_user_id, created_at, updated_at)
      SELECT
        gen_random_uuid(),
        COALESCE(u.name, SPLIT_PART(u.email, '@', 1)) || '''s Replane',
        u.id,
        NOW(),
        NOW()
      FROM users u
      WHERE NOT EXISTS (
        SELECT 1 FROM organizations o
        WHERE o.personal_org_user_id = u.id
      );

      -- Add users as admins to their personal organizations
      INSERT INTO organization_members (organization_id, user_email_normalized, role, created_at, updated_at)
      SELECT
        o.id,
        u.email,
        'admin',
        NOW(),
        NOW()
      FROM organizations o
      INNER JOIN users u ON o.personal_org_user_id = u.id
      WHERE o.personal_org_user_id IS NOT NULL
      ON CONFLICT (organization_id, user_email_normalized) DO NOTHING;
    `,
  },
  {
    sql: /*sql*/ `
      -- Add auto_add_new_users column to organizations
      ALTER TABLE organizations
      ADD COLUMN auto_add_new_users BOOLEAN NOT NULL DEFAULT false;

      -- Set personal organizations to NOT auto-add users
      UPDATE organizations
      SET auto_add_new_users = false
      WHERE personal_org_user_id IS NOT NULL;

      -- for self-hosted organizations auto add new users
      UPDATE organizations
      SET auto_add_new_users = true
      WHERE id = '${DEFAULT_ORGANIZATION_ID}';
    `,
  },
  {
    sql: /*sql*/ `
      -- Create default projects for personal organizations and rename them

      -- Step 1: Create a default project for each personal organization
      INSERT INTO projects (id, name, description, is_example, organization_id, require_proposals, allow_self_approvals, created_at, updated_at)
      SELECT
        gen_random_uuid(),
        'Default Project',
        'Your first project',
        FALSE,
        o.id,
        FALSE,
        TRUE,
        NOW(),
        NOW()
      FROM organizations o
      WHERE o.personal_org_user_id IS NOT NULL;

      -- Step 2: Create Production and Development environments for each new project
      INSERT INTO project_environments (id, project_id, name, "order", created_at, updated_at)
      SELECT
        gen_random_uuid(),
        p.id,
        'Production',
        1,
        NOW(),
        NOW()
      FROM projects p
      INNER JOIN organizations o ON p.organization_id = o.id
      WHERE o.personal_org_user_id IS NOT NULL
      AND NOT EXISTS (
        SELECT 1 FROM project_environments pe
        WHERE pe.project_id = p.id AND pe.name = 'Production'
      );

      INSERT INTO project_environments (id, project_id, name, "order", created_at, updated_at)
      SELECT
        gen_random_uuid(),
        p.id,
        'Development',
        2,
        NOW(),
        NOW()
      FROM projects p
      INNER JOIN organizations o ON p.organization_id = o.id
      WHERE o.personal_org_user_id IS NOT NULL
      AND NOT EXISTS (
        SELECT 1 FROM project_environments pe
        WHERE pe.project_id = p.id AND pe.name = 'Development'
      );

      -- Step 3: Add users as project owners for their personal organization projects
      INSERT INTO project_users (project_id, user_email_normalized, role, created_at, updated_at)
      SELECT
        p.id,
        LOWER(TRIM(u.email)),
        'admin',
        NOW(),
        NOW()
      FROM projects p
      INNER JOIN organizations o ON p.organization_id = o.id
      INNER JOIN users u ON o.personal_org_user_id = u.id
      WHERE o.personal_org_user_id IS NOT NULL
      ON CONFLICT (project_id, user_email_normalized) DO NOTHING;
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

      ALTER TABLE migrations DROP CONSTRAINT IF EXISTS migrations_sql_key;
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
