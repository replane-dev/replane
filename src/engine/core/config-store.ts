import {Kysely} from 'kysely';
import {v7 as uuidV7} from 'uuid';
import {z} from 'zod';
import {DB, JsonValue} from './db';

export function ConfigName() {
  return z.string().regex(/^[a-zA-Z0-9_]+$/);
}

export function Config() {
  return z.object({
    name: ConfigName(),
    value: z.unknown(),
    version: z.number(),
  });
}

export interface Config extends z.infer<ReturnType<typeof Config>> {}

export class ConfigStore {
  constructor(private readonly db: Kysely<DB>) {}

  async getAll(): Promise<Config[]> {
    return await this.db
      .selectFrom('configs')
      .selectAll()
      .execute()
      .then(y =>
        y.map(x => ({
          ...x,
          value: (x as unknown as {value: JsonValue}).value,
        })),
      );
  }

  async get(name: string): Promise<Config | undefined> {
    return await this.db.selectFrom('configs').selectAll().where('name', '=', name).executeTakeFirst();
  }

  async put(config: Config): Promise<void> {
    console.log('hello');
    try {
      const query = this.db
        .insertInto('configs')
        .values({
          created_at: new Date(),
          id: uuidV7(),
          updated_at: new Date(),
          name: config.name,
          value: {value: config.value} as JsonValue,
          version: config.version,
        })
        .onConflict(oc =>
          oc.column('name').doUpdateSet({
            value: {value: config.value} as JsonValue,
          }),
        );

      const compiled = query.compile();
      console.log('sql', compiled.sql, compiled.parameters);
      await query.execute();
    } catch (error) {
      console.error(error);
      throw error;
    }
  }
}
