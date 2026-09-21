import {
  exportInstance,
  importInstance,
  INSTANCE_TABLES,
  isInstanceTransferAuthorized,
  validateInstanceBackup,
} from '@/engine/core/instance-transfer';
import {migrations} from '@/engine/core/migrations';
import {getDatabaseUrl} from '@/environment';
import {randomUUID} from 'node:crypto';
import {Pool} from 'pg';
import {afterAll, beforeAll, describe, expect, it} from 'vitest';

describe('instance transfer authorization', () => {
  it('requires the exact nonempty operator token', () => {
    expect(isInstanceTransferAuthorized(null, undefined)).toBe(false);
    expect(isInstanceTransferAuthorized('', '')).toBe(false);
    expect(isInstanceTransferAuthorized('wrong', 'operator-secret')).toBe(false);
    expect(isInstanceTransferAuthorized('operator-secret', 'operator-secret')).toBe(true);
  });
  it('rejects malformed and incomplete backups', () => {
    for (const input of [null, [], {}, {format: 'replane-instance', version: 1, tables: {}}]) {
      expect(() => validateInstanceBackup(input)).toThrow();
    }
  });
});

describe('instance transfer PostgreSQL integration', () => {
  let pool: Pool;
  const source = `transfer_source_${randomUUID().replaceAll('-', '')}`;
  const target = `transfer_target_${randomUUID().replaceAll('-', '')}`;
  const now = '2025-01-01T00:00:00.123Z';
  const workspaceId = randomUUID();
  const projectId = randomUUID();
  const environmentId = randomUUID();
  const configId = randomUUID();
  const proposalId = randomUUID();
  const versionId = randomUUID();
  const adminKeyId = randomUUID();

  beforeAll(async () => {
    pool = new Pool({connectionString: getDatabaseUrl()});
    for (const schema of [source, target]) {
      const client = await pool.connect();
      try {
        await client.query(`CREATE SCHEMA "${schema}"`);
        await client.query(`SET search_path TO "${schema}"`);
        await client.query(
          'CREATE TABLE migrations(id integer PRIMARY KEY, sql text NOT NULL, runat timestamptz NOT NULL)',
        );
        for (const [index, migration] of migrations.entries()) {
          await client.query(migration.sql);
          await client.query('INSERT INTO migrations VALUES ($1, $2, NOW())', [
            index + 1,
            migration.sql,
          ]);
        }
      } finally {
        client.release();
      }
    }
  }, 60000);

  afterAll(async () => {
    if (!pool) return;
    for (const schema of [source, target])
      await pool.query(`DROP SCHEMA IF EXISTS "${schema}" CASCADE`);
    await pool.end();
  });

  it('round-trips every durable table, preserves credentials/history, clears transient state, and advances user IDs', async () => {
    const backup = await exportInstance(pool, source);
    const tables = backup.tables;
    tables.users = [
      {id: 42, email: 'owner@example.com', name: 'Owner', image: null, emailVerified: now},
    ];
    tables.accounts = [
      {
        id: 17,
        userId: 42,
        type: 'oauth',
        provider: 'github',
        providerAccountId: 'owner',
        refresh_token: 'refresh',
        access_token: 'access',
        expires_at: '9007199254740993',
        token_type: 'bearer',
        scope: 'email',
        id_token: null,
        session_state: null,
      },
    ];
    tables.user_credentials = [
      {
        email: 'owner@example.com',
        password_hash: 'argon2-password-hash',
        created_at: now,
        updated_at: now,
      },
    ];
    tables.user_notification_preferences = [
      {
        user_id: 42,
        proposal_approved: true,
        proposal_rejected: false,
        proposal_waiting_for_review: true,
        created_at: now,
        updated_at: now,
      },
    ];
    tables.workspaces = [
      {
        id: workspaceId,
        name: 'Migrated workspace',
        logo: 'data:image/png;base64,abc',
        auto_add_new_users: true,
        created_at: now,
        updated_at: now,
      },
    ];
    tables.workspace_members = [
      {
        workspace_id: workspaceId,
        user_email_normalized: 'owner@example.com',
        role: 'admin',
        created_at: now,
        updated_at: now,
      },
    ];
    tables.projects = [
      {
        id: projectId,
        workspace_id: workspaceId,
        name: 'Project',
        description: 'Description',
        require_proposals: true,
        allow_self_approvals: false,
        created_at: now,
        updated_at: now,
      },
    ];
    tables.project_users = [
      {
        project_id: projectId,
        user_email_normalized: 'owner@example.com',
        role: 'admin',
        created_at: now,
        updated_at: now,
      },
    ];
    tables.project_environments = [
      {
        id: environmentId,
        project_id: projectId,
        name: 'Production',
        order: 0,
        require_proposals: true,
        created_at: now,
        updated_at: now,
      },
    ];
    tables.configs = [
      {
        id: configId,
        project_id: projectId,
        name: 'feature',
        description: 'With JSONC',
        value: '{/* keep */"enabled":true}',
        overrides: '[]',
        schema: null,
        version: 7,
        created_at: now,
        updated_at: now,
      },
    ];
    tables.config_users = [
      {
        config_id: configId,
        user_email_normalized: 'owner@example.com',
        role: 'maintainer',
        created_at: now,
        updated_at: now,
      },
    ];
    tables.config_variants = [
      {
        id: randomUUID(),
        config_id: configId,
        environment_id: environmentId,
        value: 'false',
        overrides: '[]',
        schema: null,
        use_base_schema: true,
        created_at: now,
        updated_at: now,
      },
    ];
    tables.config_proposals = [
      {
        id: proposalId,
        config_id: configId,
        author_id: 42,
        reviewer_id: null,
        base_config_version: 7,
        description: 'Proposed',
        value: 'true',
        overrides: '[]',
        schema: null,
        is_delete: false,
        message: null,
        created_at: now,
        approved_at: null,
        rejected_at: null,
        rejection_reason: null,
        rejected_in_favor_of_proposal_id: null,
      },
    ];
    // Include a forward self-reference; all rows must be inserted in one statement.
    tables.config_proposals.unshift({
      ...tables.config_proposals[0],
      id: randomUUID(),
      rejected_at: now,
      rejection_reason: 'another_proposal_approved',
      rejected_in_favor_of_proposal_id: proposalId,
    });
    tables.config_proposal_members = [
      {id: randomUUID(), proposal_id: proposalId, email: 'owner@example.com', role: 'maintainer'},
    ];
    tables.config_proposal_variants = [
      {
        id: randomUUID(),
        proposal_id: proposalId,
        environment_id: environmentId,
        value: 'true',
        overrides: '[]',
        schema: null,
        use_base_schema: true,
      },
    ];
    tables.config_versions = [
      {
        id: versionId,
        config_id: configId,
        config_name: 'feature',
        author_id: 42,
        proposal_id: proposalId,
        version: 7,
        description: 'History',
        value: 'true',
        overrides: '[]',
        schema: null,
        created_at: now,
      },
    ];
    tables.config_version_members = [
      {
        id: randomUUID(),
        config_version_id: versionId,
        email: 'owner@example.com',
        role: 'maintainer',
      },
    ];
    tables.config_version_variants = [
      {
        id: randomUUID(),
        config_version_id: versionId,
        environment_id: environmentId,
        value: 'false',
        overrides: '[]',
        schema: null,
        use_base_schema: true,
      },
    ];
    tables.sdk_keys = [
      {
        id: randomUUID(),
        project_id: projectId,
        environment_id: environmentId,
        name: 'SDK',
        description: '',
        key_hash: 'sdk-hash',
        key_prefix: 'rp',
        key_suffix: '1234',
        created_at: now,
      },
    ];
    tables.admin_api_keys = [
      {
        id: adminKeyId,
        workspace_id: workspaceId,
        name: 'Admin',
        description: '',
        key_hash: 'admin-hash',
        key_prefix: 'rp',
        key_suffix: '4321',
        created_by_email: 'owner@example.com',
        expires_at: null,
        last_used_at: now,
        created_at: now,
        updated_at: now,
      },
    ];
    tables.admin_api_key_projects = [{admin_api_key_id: adminKeyId, project_id: projectId}];
    tables.admin_api_key_scopes = [{admin_api_key_id: adminKeyId, scope: 'config:read'}];
    tables.audit_logs = [
      {
        id: randomUUID(),
        project_id: projectId,
        config_id: configId,
        environment_id: environmentId,
        user_id: 42,
        payload: '{"type":"test"}',
        created_at: now,
      },
    ];
    for (const table of INSTANCE_TABLES) expect(tables[table].length).toBeGreaterThan(0);
    await importInstance(pool, backup, source);
    const exported = JSON.parse(JSON.stringify(await exportInstance(pool, source)));
    await pool.query(
      `INSERT INTO "${target}".users(name, email) VALUES ('Temporary', 'temporary@example.com')`,
    );
    await pool.query(
      `INSERT INTO "${target}".sessions("userId", expires, "sessionToken") VALUES (1, NOW(), 'old-session')`,
    );
    const consumer = await pool.query(
      `INSERT INTO "${target}".event_consumers(topic, created_at, last_used_at) VALUES ('configs', NOW(), NOW()) RETURNING id`,
    );
    await importInstance(pool, exported, target);
    const restored = await exportInstance(pool, target);
    for (const table of INSTANCE_TABLES) {
      expect(restored.tables[table]).toHaveLength(exported.tables[table].length);
      expect(restored.tables[table]).toEqual(expect.arrayContaining(exported.tables[table]));
    }
    expect((await pool.query(`SELECT * FROM "${target}".sessions`)).rows).toHaveLength(0);
    expect((await pool.query(`SELECT * FROM "${target}".event_consumers`)).rows).toHaveLength(0);
    const newUser = await pool.query(
      `INSERT INTO "${target}".users(name) VALUES ('New user') RETURNING id`,
    );
    expect(newUser.rows[0].id).toBe(43);
    const newAccount = await pool.query(
      `INSERT INTO "${target}".accounts("userId", type, provider, "providerAccountId") VALUES (43, 'oauth', 'github', 'new') RETURNING id`,
    );
    expect(newAccount.rows[0].id).toBe(18);
    const newConsumer = await pool.query(
      `INSERT INTO "${target}".event_consumers(topic, created_at, last_used_at) VALUES ('configs', NOW(), NOW()) RETURNING id`,
    );
    expect(BigInt(newConsumer.rows[0].id)).toBeGreaterThan(BigInt(consumer.rows[0].id));
  });

  it('rolls back all data when a late foreign key insert fails', async () => {
    const before = await exportInstance(pool, target);
    const invalid = structuredClone(before);
    invalid.tables.users[0].name = 'Must roll back';
    invalid.tables.admin_api_key_projects[0].project_id = randomUUID();
    await expect(importInstance(pool, invalid, target)).rejects.toThrow();
    expect((await exportInstance(pool, target)).tables).toEqual(before.tables);
  });

  it('rejects incompatible schemas, missing tables, and missing/extra columns without replacing data', async () => {
    const before = await exportInstance(pool, target);
    const badSchema = structuredClone(before);
    badSchema.schemaVersion = 'wrong';
    const missingTable = structuredClone(before);
    delete missingTable.tables.users;
    const missingColumn = structuredClone(before);
    delete missingColumn.tables.users[0].name;
    const extraColumn = structuredClone(before);
    extraColumn.tables.users[0].unexpected = true;
    for (const invalid of [badSchema, missingTable, missingColumn, extraColumn]) {
      await expect(importInstance(pool, invalid, target)).rejects.toThrow();
      expect((await exportInstance(pool, target)).tables).toEqual(before.tables);
    }
  });
});
