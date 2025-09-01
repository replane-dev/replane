import {Kysely} from 'kysely';
import assert from 'node:assert';
import {v7 as uuidV7} from 'uuid';
import {z} from 'zod';
import {Configs, DB, JsonValue} from './db';

export function ConfigName() {
  return z
    .string()
    .regex(/^[a-z_]{1,100}$/)
    .describe('A config name consisting of lowercase letters and underscores, 1-100 characters long');
}

export function Config() {
  return z.object({
    name: ConfigName(),
    value: z.unknown().refine(val => {
      return JSON.stringify(val).length < 1048576; // 1MB
    }),
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
    const result = await this.db.selectFrom('configs').selectAll().where('name', '=', name).executeTakeFirst();
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
          created_at: new Date(),
          id: uuidV7(),
          updated_at: new Date(),
          name: config.name,
          value: {value: config.value} as JsonValue,
        })
        .onConflict(oc =>
          oc.column('name').doUpdateSet({
            value: {value: config.value} as JsonValue,
          }),
        );

      await query.execute();
    } catch (error) {
      console.error(error);
      throw error;
    }
  }
}

function mapConfig(config: Pick<Configs, 'name' | 'value'>): Config {
  assert(typeof config.value === 'object' && config.value !== null && 'value' in config.value);

  return {
    name: config.name,
    value: config.value.value,
  };
}
