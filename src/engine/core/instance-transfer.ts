import {createHash, timingSafeEqual} from 'node:crypto';
import type {Pool, PoolClient} from 'pg';
import type {DB} from './db';

// Dependency order. Transient sessions and replication state are deliberately not exported.
export const INSTANCE_TABLES = [
  'users',
  'accounts',
  'user_credentials',
  'user_notification_preferences',
  'workspaces',
  'workspace_members',
  'projects',
  'project_users',
  'project_environments',
  'configs',
  'config_users',
  'config_variants',
  'config_proposals',
  'config_proposal_members',
  'config_proposal_variants',
  'config_versions',
  'config_version_members',
  'config_version_variants',
  'sdk_keys',
  'admin_api_keys',
  'admin_api_key_projects',
  'admin_api_key_scopes',
  'audit_logs',
] as const satisfies readonly (keyof DB)[];
const TRANSIENT_TABLES = ['sessions', 'verification_token', 'events', 'event_consumers'] as const;
// A new database table must be explicitly classified before this code compiles.
const allTables: Record<keyof DB, true> = Object.fromEntries(
  [...INSTANCE_TABLES, ...TRANSIENT_TABLES, 'migrations'].map(t => [t, true]),
) as Record<
  (typeof INSTANCE_TABLES)[number] | (typeof TRANSIENT_TABLES)[number] | 'migrations',
  true
>;
void allTables;

type Row = Record<string, unknown>;
export interface InstanceBackup {
  format: 'replane-instance';
  version: 1;
  exportedAt: string;
  schemaVersion: string;
  tables: Record<string, Row[]>;
}
export class InvalidInstanceBackupError extends Error {}

export function isInstanceTransferAuthorized(token: string | null, expected: string | undefined) {
  if (!expected || !token) return false;
  const hash = (value: string) => createHash('sha256').update(value).digest();
  return timingSafeEqual(hash(token), hash(expected));
}

const quote = (name: string) => `"${name.replaceAll('"', '""')}"`;

async function schemaVersion(client: PoolClient): Promise<string> {
  const result = await client.query('SELECT id, sql FROM migrations ORDER BY id');
  return createHash('sha256').update(JSON.stringify(result.rows)).digest('hex');
}

export function validateInstanceBackup(value: unknown): InstanceBackup {
  const fail = (): never => {
    throw new InvalidInstanceBackupError('Invalid or incomplete Replane instance backup.');
  };
  if (!value || typeof value !== 'object') return fail();
  const backup = value as InstanceBackup;
  if (
    backup.format !== 'replane-instance' ||
    backup.version !== 1 ||
    typeof backup.schemaVersion !== 'string' ||
    typeof backup.exportedAt !== 'string' ||
    !backup.tables ||
    typeof backup.tables !== 'object' ||
    Array.isArray(backup.tables)
  )
    return fail();
  if (Object.keys(backup.tables).sort().join(',') !== [...INSTANCE_TABLES].sort().join(','))
    return fail();
  for (const table of INSTANCE_TABLES) {
    if (
      !Array.isArray(backup.tables[table]) ||
      backup.tables[table].some(row => !row || typeof row !== 'object' || Array.isArray(row))
    )
      return fail();
  }
  return backup;
}

async function transaction<T>(
  pool: Pool,
  schema: string,
  readOnly: boolean,
  run: (client: PoolClient) => Promise<T>,
) {
  const client = await pool.connect();
  try {
    await client.query(readOnly ? 'BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY' : 'BEGIN');
    await client.query(`SET LOCAL search_path TO ${quote(schema)}`);
    await client.query("SET LOCAL lock_timeout = '15s'");
    const result = await run(client);
    await client.query('COMMIT');
    return result;
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

export async function exportInstance(pool: Pool, schema = 'public'): Promise<InstanceBackup> {
  return transaction(pool, schema, true, async client => {
    const tables: InstanceBackup['tables'] = {};
    const version = await schemaVersion(client);
    for (const table of INSTANCE_TABLES) {
      // Let PostgreSQL serialize timestamps and JSON without driver conversions.
      const rowExpression =
        table === 'accounts'
          ? "to_jsonb(t) || jsonb_build_object('expires_at', t.expires_at::text)"
          : 'row_to_json(t)';
      const result = await client.query(`SELECT ${rowExpression} AS row FROM ${quote(table)} t`);
      tables[table] = result.rows.map(r => r.row);
    }
    return {
      format: 'replane-instance',
      version: 1,
      exportedAt: new Date().toISOString(),
      schemaVersion: version,
      tables,
    };
  });
}

export async function importInstance(pool: Pool, value: unknown, schema = 'public'): Promise<void> {
  const backup = validateInstanceBackup(value);
  await transaction(pool, schema, false, async client => {
    // Serialize restores and block concurrent application writes throughout replacement.
    await client.query(
      `LOCK TABLE ${[...INSTANCE_TABLES, ...TRANSIENT_TABLES, 'migrations'].map(quote).join(', ')} IN ACCESS EXCLUSIVE MODE`,
    );
    if (backup.schemaVersion !== (await schemaVersion(client))) {
      throw new InvalidInstanceBackupError(
        'Backup and destination must run the same database migrations. Use the same Replane version.',
      );
    }
    for (const table of INSTANCE_TABLES) {
      const {rows: columns} = await client.query(
        'SELECT column_name FROM information_schema.columns WHERE table_schema = $1 AND table_name = $2 ORDER BY column_name',
        [schema, table],
      );
      const expected = columns
        .map(c => c.column_name)
        .sort()
        .join(',');
      if (backup.tables[table].some(row => Object.keys(row).sort().join(',') !== expected)) {
        throw new InvalidInstanceBackupError(`Invalid columns in ${table}.`);
      }
    }
    // No CASCADE: an unexpected external dependency must fail rather than be erased.
    // Never reset event consumer IDs: cached replicas must not match newly created consumers.
    await client.query(
      `TRUNCATE ${[...INSTANCE_TABLES, ...TRANSIENT_TABLES].map(quote).join(', ')}`,
    );
    for (const table of INSTANCE_TABLES) {
      await client.query(
        `INSERT INTO ${quote(table)} SELECT * FROM json_populate_recordset(NULL::${quote(table)}, $1::json)`,
        [JSON.stringify(backup.tables[table])],
      );
    }
    // ALTER SEQUENCE, unlike setval, rolls back if any later restore step fails.
    for (const table of ['users', 'accounts'] as const) {
      const {rows} = await client.query(
        `SELECT pg_get_serial_sequence($1, 'id') AS sequence, (COALESCE(MAX(id), 0)::bigint + 1)::text AS next FROM ${quote(table)}`,
        [table],
      );
      if (rows[0].sequence) {
        const next = rows[0].next as string;
        if (!/^\d+$/.test(next)) throw new InvalidInstanceBackupError('Invalid sequence value.');
        // Resolve the sequence's identifiers from the catalog, never the backup file.
        const {rows: sequences} = await client.query(
          'SELECT n.nspname, c.relname FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace WHERE c.oid = $1::regclass',
          [rows[0].sequence],
        );
        await client.query(
          `ALTER SEQUENCE ${quote(sequences[0].nspname)}.${quote(sequences[0].relname)} RESTART WITH ${next}`,
        );
      }
    }
  });
}
