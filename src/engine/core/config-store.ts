import {Kysely, type Selectable} from 'kysely';
import {z} from 'zod';
import type {Configs, DB} from './db';
import type {EventBusClient} from './event-bus';
import {ConditionSchema, OverrideSchema} from './override-condition-schemas';
import type {Override} from './override-evaluator';
import {fromJsonb, toJsonb} from './store-utils';
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

export function ConfigOverride() {
  return OverrideSchema.extend({
    name: z.string().min(1).max(100),
    conditions: z.array(ConditionSchema).max(100),
    value: ConfigValue(),
  });
}

export function ConfigOverrides() {
  return z.array(ConfigOverride()).max(100);
}

export function Config() {
  return z.object({
    id: Uuid(),
    name: ConfigName(),
    value: ConfigValue(),
    schema: ConfigSchema().nullable(),
    description: ConfigDescription(),
    overrides: ConfigOverrides(),
    createdAt: z.date(),
    updatedAt: z.date(),
    creatorId: z.number(),
    version: z.number(),
    projectId: z.string(),
  });
}

export interface Config extends z.infer<ReturnType<typeof Config>> {}

export class ConfigStore {
  constructor(
    private readonly db: Kysely<DB>,
    private readonly scheduleOptimisticEffect: (effect: () => Promise<void>) => void,
    private readonly eventBusClient: EventBusClient<ConfigChangePayload>,
  ) {}

  async getReplicaDump(): Promise<
    Array<{
      id: string;
      name: string;
      projectId: string;
      value: unknown;
      overrides: Override[];
      version: number;
    }>
  > {
    const rows = await this.db
      .selectFrom('configs')
      .select(['id', 'name', 'value', 'overrides', 'version', 'project_id'])
      .execute();
    return rows.map(row => ({
      id: row.id,
      name: row.name,
      value: fromJsonb(row.value),
      overrides: fromJsonb(row.overrides) ?? [],
      version: row.version,
      projectId: row.project_id,
    }));
  }

  async getReplicaConfig(configId: string): Promise<{
    name: string;
    projectId: string;
    value: unknown;
    overrides: Override[];
    version: number;
  } | null> {
    const row = await this.db
      .selectFrom('configs')
      .select(['name', 'value', 'overrides', 'version', 'project_id'])
      .where('id', '=', configId)
      .executeTakeFirst();
    if (!row) {
      return null;
    }
    return {
      name: row.name,
      value: fromJsonb(row.value),
      overrides: fromJsonb(row.overrides) ?? [],
      version: row.version,
      projectId: row.project_id,
    };
  }

  async getAll(params: {
    currentUserEmail: NormalizedEmail;
    projectId: string;
  }): Promise<ConfigInfo[]> {
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
      .where('configs.project_id', '=', params.projectId)
      .select([
        'configs.created_at',
        'configs.id',
        'configs.name',
        'configs.value',
        'configs.schema',
        'configs.description',
        'configs.overrides',
        'configs.updated_at',
        'configs.creator_id',
        'config_users.role as myRole',
        'configs.version',
        'configs.project_id',
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
      projectId: c.project_id,
    }));
  }

  async getByName(params: {projectId: string; name: string}): Promise<Config | undefined> {
    const result = await this.db
      .selectFrom('configs')
      .selectAll()
      .where('name', '=', params.name)
      .where('project_id', '=', params.projectId)
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
        value: toJsonb(config.value),
        schema: config.schema ? toJsonb(config.schema) : null,
        overrides: config.overrides ? toJsonb(config.overrides) : null,
        version: 1,
        project_id: config.projectId,
      })
      .execute();

    this.notifyConfigChange({configId: config.id});
  }

  async updateById(params: {
    id: string;
    value: unknown;
    schema: unknown;
    overrides: unknown;
    updatedAt: Date;
    description: string;
    version: number;
  }): Promise<void> {
    await this.db
      .updateTable('configs')
      .set({
        value: toJsonb(params.value),
        description: params.description,
        schema: params.schema ? toJsonb(params.schema) : null,
        overrides: params.overrides ? toJsonb(params.overrides) : null,
        updated_at: params.updatedAt,
        version: params.version,
      })
      .where('id', '=', params.id)
      .execute();

    this.notifyConfigChange({configId: params.id});
  }

  async deleteById(id: string): Promise<void> {
    await this.db.deleteFrom('configs').where('id', '=', id).execute();

    this.notifyConfigChange({configId: id});
  }

  private notifyConfigChange(payload: ConfigChangePayload): void {
    this.scheduleOptimisticEffect(async () => {
      await this.eventBusClient.notify(payload);
    });
  }
}

export interface ConfigChangePayload {
  configId: string;
}

function mapConfig(config: Selectable<Configs>): Config {
  return {
    id: config.id,
    creatorId: config.creator_id,
    name: config.name,
    value: fromJsonb(config.value),
    schema: fromJsonb(config.schema),
    overrides: fromJsonb(config.overrides) ?? [],
    description: config.description,
    createdAt: config.created_at,
    updatedAt: config.updated_at,
    version: config.version,
    projectId: config.project_id,
  };
}
