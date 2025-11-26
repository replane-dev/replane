import type {Kysely} from 'kysely';
import type {ConfigProposalId} from './config-proposal-store';
import type {ConfigId} from './config-store';
import type {DB} from './db';
import {deserializeJson, serializeJson} from './store-utils';
import {createUuidV7} from './uuid';
import type {NormalizedEmail} from './zod';

export type ConfigVersionId = string;

export function createConfigVersionId() {
  return createUuidV7() as ConfigVersionId;
}

export interface ConfigLike {
  version: number;
  description: string;
  name: string;
  value: unknown;
  schema: unknown;
  overrides: unknown;
  members: Array<{normalizedEmail: NormalizedEmail; role: 'maintainer' | 'editor'}>;
}

export interface ConfigVersion extends ConfigLike {
  id: ConfigVersionId;
  configId: ConfigId;
  createdAt: Date;
  authorId: number | null;
  proposalId: ConfigProposalId | null;
}

export class ConfigVersionStore {
  constructor(private readonly db: Kysely<DB>) {}

  async create(configVersion: ConfigVersion) {
    await this.db
      .insertInto('config_versions')
      .values([
        {
          id: configVersion.id,
          config_id: configVersion.configId,
          created_at: configVersion.createdAt,
          description: configVersion.description,
          name: configVersion.name,
          version: configVersion.version,
          schema: configVersion.schema ? serializeJson(configVersion.schema) : null,
          overrides: configVersion.overrides ? serializeJson(configVersion.overrides) : null,
          value: serializeJson(configVersion.value),
          author_id: configVersion.authorId,
          proposal_id: configVersion.proposalId,
        },
      ])
      .execute();

    // Insert members into separate table
    if (configVersion.members.length > 0) {
      const memberRows = configVersion.members.map(member => ({
        config_version_id: configVersion.id,
        user_email_normalized: member.normalizedEmail,
        role: member.role,
      }));

      await this.db.insertInto('config_version_members').values(memberRows).execute();
    }
  }

  async listByConfigId(configId: string) {
    const rows = await this.db
      .selectFrom('config_versions')
      .leftJoin('users', 'users.id', 'config_versions.author_id')
      .select([
        'config_versions.id as id',
        'config_versions.version as version',
        'config_versions.created_at as created_at',
        'config_versions.description as description',
        'users.email as author_email',
        'config_versions.proposal_id as proposal_id',
      ])
      .where('config_versions.config_id', '=', configId)
      .orderBy('config_versions.version', 'desc')
      .execute();
    return rows.map(r => ({
      id: r.id as ConfigVersionId,
      version: r.version,
      createdAt: r.created_at,
      description: r.description,
      authorEmail: r.author_email,
      proposalId: r.proposal_id as ConfigProposalId | null,
    }));
  }

  async getByConfigIdAndVersion(
    configId: string,
    version: number,
  ): Promise<
    | {
        id: ConfigVersionId;
        version: number;
        createdAt: Date;
        description: string;
        value: unknown;
        schema: unknown;
        overrides: unknown;
        members: Array<{normalizedEmail: string; role: 'maintainer' | 'editor'}>;
        authorEmail: string | null;
        proposalId: ConfigProposalId | null;
      }
    | undefined
  > {
    const row = await this.db
      .selectFrom('config_versions')
      .leftJoin('users', 'users.id', 'config_versions.author_id')
      .select([
        'config_versions.id as id',
        'config_versions.version as version',
        'config_versions.created_at as created_at',
        'config_versions.description as description',
        'config_versions.value as value',
        'config_versions.schema as schema',
        'config_versions.overrides as overrides',
        'users.email as author_email',
        'config_versions.proposal_id as proposal_id',
      ])
      .where('config_versions.config_id', '=', configId)
      .where('config_versions.version', '=', version)
      .executeTakeFirst();

    if (!row) return undefined;

    // Fetch members from the separate table
    const memberRows = await this.db
      .selectFrom('config_version_members')
      .select(['user_email_normalized', 'role'])
      .where('config_version_id', '=', row.id)
      .execute();

    const members = memberRows.map(m => ({
      normalizedEmail: m.user_email_normalized,
      role: m.role as 'maintainer' | 'editor',
    }));

    return {
      id: row.id as ConfigVersionId,
      version: row.version,
      createdAt: row.created_at,
      description: row.description,
      value: deserializeJson(row.value),
      schema: row.schema === null ? null : deserializeJson(row.schema),
      overrides: row.overrides === null ? null : deserializeJson(row.overrides),
      members,
      authorEmail: (row as unknown as {author_email: string | null}).author_email,
      proposalId: (row as unknown as {proposal_id: ConfigProposalId | null}).proposal_id,
    };
  }
}
