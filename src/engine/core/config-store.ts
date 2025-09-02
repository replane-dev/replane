import {Kysely, type Selectable} from 'kysely';
import assert from 'node:assert';
import {v7 as uuidV7} from 'uuid';
import {z} from 'zod';
import type {Configs, DB, JsonValue} from './db';
import {isValidJsonSchema} from './utils';
import {Uuid} from './zod';

export function ConfigName() {
  return z
    .string()
    .regex(/^[a-z_]{1,100}$/)
    .describe(
      'A config name consisting of lowercase letters and underscores, 1-100 characters long',
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
  });
}

export interface Config extends z.infer<ReturnType<typeof Config>> {}

export class ConfigStore {
  constructor(private readonly db: Kysely<DB>) {}

  async getAll(): Promise<Config[]> {
    return await this.db
      .selectFrom('configs')
      .selectAll()
      .orderBy('configs.name')
      .execute()
      .then(x => x.map(mapConfig));
  }

  async get(name: string): Promise<Config | undefined> {
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

  async put(config: Config): Promise<void> {
    try {
      const query = this.db
        .insertInto('configs')
        .values({
          created_at: config.createdAt,
          id: uuidV7(),
          updated_at: config.updatedAt,
          name: config.name,
          description: config.description,
          creator_id: config.creatorId,
          value: {value: config.value} as JsonValue,
          schema: config.schema
            ? ({value: config.schema} as unknown as JsonValue)
            : (null as JsonValue),
        })
        .onConflict(oc =>
          oc.column('name').doUpdateSet({
            value: {value: config.value} as JsonValue,
            description: config.description,
            schema: config.schema
              ? ({value: config.schema} as unknown as JsonValue)
              : (null as JsonValue),
            updated_at: config.updatedAt,
          }),
        );

      await query.execute();
    } catch (error) {
      console.error(error);
      throw error;
    }
  }

  async delete(name: string): Promise<void> {
    await this.db.deleteFrom('configs').where('name', '=', name).execute();
  }
}

function mapConfig(config: Selectable<Configs>): Config {
  assert(typeof config.value === 'object' && config.value !== null && 'value' in config.value);
  assert(config.schema === null || (typeof config.schema === 'object' && 'value' in config.schema));

  return {
    id: config.id,
    creatorId: config.creator_id,
    name: config.name,
    value: config.value.value,
    description: config.description,
    schema: config.schema ? config.schema.value : null,
    createdAt: config.created_at,
    updatedAt: config.updated_at,
  };
}
