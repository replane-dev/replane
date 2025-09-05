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
        },
      ])
      .execute();
  }
}
