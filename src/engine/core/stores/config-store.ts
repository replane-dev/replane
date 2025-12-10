import assert from 'assert';
import {Kysely, type Selectable} from 'kysely';
import {z} from 'zod';
import type {Context} from '../context';
import type {Configs, DB} from '../db';
import type {EventHubPublisher} from '../event-hub';
import {OverrideSchema} from '../override-condition-schemas';
import type {Override} from '../override-evaluator';
import type {ConfigChangeEvent} from '../replica';
import {deserializeJson} from '../store-utils';
import {createUuidV7} from '../uuid';
import {ConfigInfo, ConfigValue, Uuid, type NormalizedEmail} from '../zod';

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

export function ConfigDescription() {
  return z.string().max(1_000_000);
}

export function ConfigOverrides() {
  return z.array(OverrideSchema).max(100);
}

export function Config() {
  return z.object({
    id: Uuid(),
    name: ConfigName(),
    description: ConfigDescription(),
    createdAt: z.date(),
    updatedAt: z.date(),
    creatorId: z.number(),
    projectId: z.string(),
    version: z.number(),
  });
}

export interface Config extends z.infer<ReturnType<typeof Config>> {}

export interface ConfigReplicaDump {
  configId: string;
  name: string;
  projectId: string;
  environmentId: string;
  value: ConfigValue;
  overrides: Override[];
  version: number;
}

export class ConfigStore {
  constructor(
    private readonly db: Kysely<DB>,
    private readonly hub: EventHubPublisher<ConfigChangeEvent>,
  ) {}

  async getDefaultVariant(configId: string): Promise<{
    id: string;
    value: ConfigValue;
    schema: unknown | null;
    overrides: Override[];
    version: number;
  } | null> {
    const row = await this.db
      .selectFrom('config_variants as cv')
      .innerJoin('configs as c', 'c.id', 'cv.config_id')
      .select(['cv.id', 'cv.value', 'cv.schema', 'cv.overrides', 'c.version'])
      .where('cv.config_id', '=', configId)
      .where('cv.environment_id', 'is', null)
      .executeTakeFirst();

    if (!row) {
      return null;
    }

    return {
      id: row.id,
      value: deserializeJson(row.value),
      schema: row.schema ? deserializeJson(row.schema) : null,
      overrides: deserializeJson(row.overrides) ?? [],
      version: row.version,
    };
  }

  async getVariantsByConfigId(configId: string): Promise<
    Array<{
      name: string;
      projectId: string;
      environmentId: string | null;
      value: ConfigValue;
      overrides: Override[];
      version: number;
    }>
  > {
    const rows = await this.db
      .selectFrom('config_variants as cv')
      .innerJoin('configs as c', 'c.id', 'cv.config_id')
      .select([
        'c.name',
        'c.project_id',
        'cv.environment_id',
        'cv.value',
        'cv.overrides',
        'c.version',
      ])
      .where('cv.config_id', '=', configId)
      .execute();
    return rows.map(row => ({
      name: row.name,
      projectId: row.project_id,
      environmentId: row.environment_id,
      value: deserializeJson(row.value),
      overrides: deserializeJson(row.overrides) ?? [],
      version: row.version,
    }));
  }

  async getProjectConfigs(params: {
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
        'configs.description',
        'configs.creator_id',
        'config_users.role as myRole',
        'configs.project_id',
      ]);

    const configs = await configsQuery.execute();

    return configs.map(c => ({
      name: c.name,
      createdAt: c.created_at,
      updatedAt: c.created_at, // No updated_at on configs table anymore, use created_at
      descriptionPreview: c.description.substring(0, 100),
      myRole: c.myRole ?? 'viewer',
      version: 1, // No version on configs table, placeholder
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

  async create(ctx: Context, config: Config): Promise<void> {
    await this.db
      .insertInto('configs')
      .values({
        created_at: config.createdAt,
        updated_at: config.updatedAt,
        id: config.id,
        name: config.name,
        description: config.description,
        creator_id: config.creatorId,
        project_id: config.projectId,
        version: config.version,
      })
      .execute();

    await this.hub.pushEvent(ctx, {configId: config.id});
  }

  async update(params: {
    ctx: Context;
    id: string;
    description: string;
    version: number;
    updatedAt: Date;
  }): Promise<void> {
    await this.db
      .updateTable('configs')
      .set({
        description: params.description,
        version: params.version,
        updated_at: params.updatedAt,
      })
      .where('id', '=', params.id)
      .execute();

    await this.hub.pushEvent(params.ctx, {configId: params.id});
  }

  async deleteById(ctx: Context, id: string): Promise<void> {
    await this.db.deleteFrom('configs').where('id', '=', id).execute();

    await this.hub.pushEvent(ctx, {configId: id});
  }

  async getConfigSchemas(params: {
    projectId: string;
    environmentId: string;
  }): Promise<Array<{name: string; schema: unknown | null}>> {
    const rows = await this.db
      .selectFrom('configs as c')
      .leftJoin('config_variants as cv', jb =>
        jb.on(eb =>
          eb.and([
            eb('cv.config_id', '=', eb.ref('c.id')),
            eb('cv.environment_id', '=', params.environmentId),
          ]),
        ),
      )
      .leftJoin('config_variants as cv_default', jb =>
        jb.on(eb =>
          eb.and([
            eb('cv_default.config_id', '=', eb.ref('c.id')),
            eb('cv_default.environment_id', 'is', null),
          ]),
        ),
      )
      .select([
        'c.name',
        'cv.use_default_schema as use_default_schema',
        'cv.schema as environment_schema',
        'cv_default.schema as default_schema',
      ])
      .where('c.project_id', '=', params.projectId)
      .orderBy('c.name')
      .execute();

    return rows.map(row => {
      if (row.use_default_schema !== false) {
        assert(row.default_schema, 'Default schema is required when use_default_schema is true');
        return {
          name: row.name,
          schema: JSON.parse(row.default_schema),
        };
      }

      assert(
        row.environment_schema,
        'Environment schema is required when use_default_schema is false',
      );
      return {
        name: row.name,
        schema: JSON.parse(row.environment_schema),
      };
    });
  }
}

function mapConfig(config: Selectable<Configs>): Config {
  return {
    id: config.id,
    creatorId: config.creator_id,
    name: config.name,
    description: config.description,
    createdAt: config.created_at,
    updatedAt: config.updated_at,
    projectId: config.project_id,
    version: config.version,
  };
}
