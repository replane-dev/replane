import {Kysely, type Selectable} from 'kysely';
import {z} from 'zod';
import type {Context} from '../context';
import type {Configs, DB} from '../db';
import type {EventHubPublisher} from '../event-hub';
import {OverrideSchema} from '../override-condition-schemas';
import type {Override} from '../override-evaluator';
import type {AppHubEvents} from '../replica';
import {deserializeJson, serializeJson} from '../store-utils';
import {createUuidV7} from '../uuid';
import {
  ConfigSchema,
  ConfigValue,
  Uuid,
  type ConfigSchema as ConfigSchemaType,
  type NormalizedEmail,
} from '../zod';

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
    value: ConfigValue(),
    schema: ConfigSchema().nullable(),
    overrides: ConfigOverrides(),
    createdAt: z.date(),
    updatedAt: z.date(),
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
    private readonly hub: EventHubPublisher<AppHubEvents>,
  ) {}

  async getDefaultVariant(params: {configId: string; projectId: string}): Promise<{
    value: ConfigValue;
    schema: ConfigSchemaType | null;
    overrides: Override[];
    version: number;
  } | null> {
    const row = await this.db
      .selectFrom('configs')
      .select(['value', 'schema', 'overrides', 'version'])
      .where('id', '=', params.configId)
      .where('project_id', '=', params.projectId)
      .executeTakeFirst();

    if (!row) {
      return null;
    }

    return {
      value: deserializeJson(row.value),
      schema: row.schema ? deserializeJson(row.schema) : null,
      overrides: deserializeJson(row.overrides) ?? [],
      version: row.version,
    };
  }

  async getVariantsByConfigId(params: {configId: string; projectId: string}): Promise<
    Array<{
      name: string;
      projectId: string;
      environmentId: string;
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
      .where('cv.config_id', '=', params.configId)
      .where('c.project_id', '=', params.projectId)
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

  async getProjectConfigs(params: {currentUserEmail?: NormalizedEmail; projectId: string}) {
    const result = await this.db
      .selectFrom('configs')
      .orderBy('configs.name')
      .where('configs.project_id', '=', params.projectId)
      .leftJoin('config_users', jb =>
        jb.on(eb =>
          eb.and([
            eb('config_users.config_id', '=', eb.ref('configs.id')),
            eb('config_users.user_email_normalized', '=', params.currentUserEmail ?? '_'),
          ]),
        ),
      )
      .select([
        'configs.created_at',
        'configs.updated_at',
        'configs.id',
        'configs.name',
        'configs.description',
        'configs.version',
        'configs.project_id',
        'config_users.role as configUserRole',
      ])
      .execute();

    return result.map(c => ({
      name: c.name,
      createdAt: c.created_at,
      updatedAt: c.updated_at,
      descriptionPreview: c.description.substring(0, 100),
      myConfigUserRole: c.configUserRole,
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

  async getById(params: {id: string; projectId: string}): Promise<Config | undefined> {
    const result = await this.db
      .selectFrom('configs')
      .selectAll()
      .where('id', '=', params.id)
      .where('project_id', '=', params.projectId)
      .executeTakeFirst();
    if (result) {
      return mapConfig(result);
    }

    return undefined;
  }

  /**
   * Get config by ID without requiring projectId.
   * WARNING: Only use this for internal permission/authorization checks where
   * the projectId is not known upfront. For data retrieval, always use getById.
   */
  async getByIdUnsafe(id: string): Promise<Config | undefined> {
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
        value: serializeJson(config.value),
        schema: serializeJson(config.schema),
        overrides: serializeJson(config.overrides),
        project_id: config.projectId,
        version: config.version,
      })
      .execute();

    await this.hub.pushEvent(ctx, 'configs', {configId: config.id});
  }

  async update(params: {
    ctx: Context;
    id: string;
    projectId: string;
    description: string;
    value: ConfigValue;
    schema: ConfigSchemaType | null;
    overrides: Override[];
    version: number;
    updatedAt: Date;
  }): Promise<void> {
    await this.db
      .updateTable('configs')
      .set({
        description: params.description,
        value: serializeJson(params.value),
        schema: serializeJson(params.schema),
        overrides: serializeJson(params.overrides),
        version: params.version,
        updated_at: params.updatedAt,
      })
      .where('id', '=', params.id)
      .where('project_id', '=', params.projectId)
      .execute();

    await this.hub.pushEvent(params.ctx, 'configs', {configId: params.id});
  }

  async deleteById(ctx: Context, params: {id: string; projectId: string}): Promise<void> {
    await this.db
      .deleteFrom('configs')
      .where('id', '=', params.id)
      .where('project_id', '=', params.projectId)
      .execute();

    await this.hub.pushEvent(ctx, 'configs', {configId: params.id});
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
      .select([
        'c.name',
        'c.schema as default_schema',
        'cv.use_base_schema as use_base_schema',
        'cv.schema as environment_schema',
      ])
      .where('c.project_id', '=', params.projectId)
      .orderBy('c.name')
      .execute();

    return rows.map(row => {
      // If no environment variant or using default schema, use the config's schema
      if (!row.environment_schema || row.use_base_schema !== false) {
        return {
          name: row.name,
          schema: row.default_schema ? JSON.parse(row.default_schema) : null,
        };
      }

      // Use the environment-specific schema
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
    name: config.name,
    description: config.description,
    value: deserializeJson(config.value),
    schema: config.schema ? deserializeJson(config.schema) : null,
    overrides: deserializeJson(config.overrides) ?? [],
    createdAt: config.created_at,
    updatedAt: config.updated_at,
    projectId: config.project_id,
    version: config.version,
  };
}
