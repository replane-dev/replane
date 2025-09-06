import type {Kysely} from 'kysely';
import type {JsonValue} from 'next-auth/adapters';
import type {ConfigId} from './config-store';
import type {DB} from './db';
import {createUuidV7} from './uuid';

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
}

export interface ConfigVersion extends ConfigLike {
  id: ConfigVersionId;
  configId: ConfigId;
  createdAt: Date;
  authorId: number | null;
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
          schema: configVersion.schema
            ? ({value: configVersion.schema} as unknown as JsonValue)
            : (null as JsonValue),
          value: {value: configVersion.value} as JsonValue,
          author_id: configVersion.authorId,
        },
      ])
      .execute();
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
      ])
      .where('config_versions.config_id', '=', configId)
      .orderBy('config_versions.version', 'desc')
      .execute();
    return rows.map(r => ({
      id: r.id as ConfigVersionId,
      version: r.version,
      createdAt: r.created_at,
      description: r.description,
      authorEmail: (r as any).author_email as string | null,
    }));
  }
}
