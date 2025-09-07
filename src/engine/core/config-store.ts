import {Kysely, type Selectable} from 'kysely';
import assert from 'node:assert';
import {z} from 'zod';
import type {Configs, DB, JsonValue} from './db';
import {isValidJsonSchema} from './utils';
import {createUuidV7} from './uuid';
import {ConfigInfo, Uuid, type NormalizedEmail} from './zod';

export type ConfigId = string;

export function createConfigId() {
  return createUuidV7() as ConfigId;
}

export function ConfigName() {
  return (
    z
      .string()
      // Allow upper/lower letters, digits, underscore and hyphen
      .regex(/^[A-Za-z0-9_-]{1,100}$/)
      .describe(
        'A config name consisting of letters (A-Z, a-z), digits, underscores or hyphens, 1-100 characters long',
      )
  );
}

export function ConfigValue() {
  return z.unknown().refine(val => {
    return JSON.stringify(val).length < 1048576; // 1MB
  });
}

export function ConfigSchema() {
  return z
    .unknown()
    .refine(val => JSON.stringify(val).length < 131072, {
      message: 'Schema JSON must be smaller than 128KB',
    })
    .refine(val => val === null || typeof val === 'boolean' || typeof val === 'object', {
      message: 'Schema must be an object or a boolean',
    })
    .refine(val => isValidJsonSchema(val), {
      message: 'Invalid JSON Schema',
    })
    .nullable();
}

export function ConfigDescription() {
  return z.string().max(1_000_000);
}

export function Config() {
  return z.object({
    id: Uuid(),
    name: ConfigName(),
    value: ConfigValue(),
    schema: ConfigSchema().nullable(),
    description: ConfigDescription(),
    createdAt: z.date(),
    updatedAt: z.date(),
    creatorId: z.number(),
    version: z.number(),
  });
}

export interface Config extends z.infer<ReturnType<typeof Config>> {}

export class ConfigStore {
  constructor(private readonly db: Kysely<DB>) {}

  async getAll(params: {currentUserEmail: NormalizedEmail}): Promise<ConfigInfo[]> {
    const configsQuery = this.db
      .selectFrom('configs')
      .orderBy('configs.name')
      .leftJoin('config_users', jb =>
        jb.on(eb =>
          eb.and([
            eb('config_users.config_id', '=', eb.ref('configs.id')),
            eb('config_users.user_email_normalized', '=', params.currentUserEmail),
          ]),
        ),
      )
      .select([
        'configs.created_at',
        'configs.id',
        'configs.name',
        'configs.value',
        'configs.schema',
        'configs.description',
        'configs.updated_at',
        'configs.creator_id',
        'config_users.role as myRole',
        'configs.version',
      ]);

    const configs = await configsQuery.execute();

    return configs.map(c => ({
      name: c.name,
      createdAt: c.created_at,
      updatedAt: c.updated_at,
      descriptionPreview: c.description.substring(0, 100),
      myRole: c.myRole ?? 'viewer',
      version: c.version,
      id: c.id,
    }));
  }

  async getByName(name: string): Promise<Config | undefined> {
    const result = await this.db
      .selectFrom('configs')
      .selectAll()
      .where('name', '=', name)
      .executeTakeFirst();
    if (result) {
      return mapConfig(result);
    }

    return undefined;
  }

  async getById(id: string): Promise<Config | undefined> {
    const result = await this.db
      .selectFrom('configs')
      .selectAll()
      .where('id', '=', id)
      .executeTakeFirst();
    if (result) {
      return mapConfig(result);
    }

    return undefined;
  }

  async create(config: Config): Promise<void> {
    await this.db
      .insertInto('configs')
      .values({
        created_at: config.createdAt,
        id: config.id,
        updated_at: config.updatedAt,
        name: config.name,
        description: config.description,
        creator_id: config.creatorId,
        value: {value: config.value} as JsonValue,
        schema: config.schema
          ? ({value: config.schema} as unknown as JsonValue)
          : (null as JsonValue),
        version: 1,
      })
      .execute();
  }

  async updateById(params: {
    id: string;
    value: unknown;
    schema: unknown;
    updatedAt: Date;
    description: string;
    version: number;
  }): Promise<void> {
    await this.db
      .updateTable('configs')
      .set({
        value: {value: params.value} as JsonValue,
        description: params.description,
        schema: params.schema
          ? ({value: params.schema} as unknown as JsonValue)
          : (null as JsonValue),
        updated_at: params.updatedAt,
        version: params.version,
      })
      .execute();
  }

  async delete(name: string): Promise<void> {
    await this.db.deleteFrom('configs').where('name', '=', name).execute();
  }

  async deleteById(id: string): Promise<void> {
    await this.db.deleteFrom('configs').where('id', '=', id).execute();
  }
}

function mapConfig(config: Selectable<Configs>): Config {
  return {
    id: config.id,
    creatorId: config.creator_id,
    name: config.name,
    value: fromJsonb(config.value),
    schema: fromJsonb(config.schema),
    description: config.description,
    createdAt: config.created_at,
    updatedAt: config.updated_at,
    version: config.version,
  };
}

function fromJsonb<T>(jsonb: JsonValue | null): T | null {
  if (jsonb === null) {
    return null;
  }
  assert(typeof jsonb === 'object' && jsonb !== null && 'value' in jsonb);
  return jsonb.value as T;
}
