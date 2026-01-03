import type {Kysely} from 'kysely';
import type {DB} from '../db';
import type {Override} from '../override-evaluator';
import {type ConfigSchema, type ConfigValue} from '../zod';

export interface ConfigVariant {
  id: string;
  configId: string;
  environmentId: string;
  value: ConfigValue;
  schema: ConfigSchema | null;
  overrides: Override[];
  createdAt: Date;
  updatedAt: Date;
  useBaseSchema: boolean;
}

export class ConfigVariantStore {
  constructor(private readonly db: Kysely<DB>) {}

  async getById(params: {id: string; projectId: string}): Promise<ConfigVariant | null> {
    const row = await this.db
      .selectFrom('config_variants')
      .innerJoin('configs', 'configs.id', 'config_variants.config_id')
      .select([
        'config_variants.id',
        'config_variants.config_id',
        'config_variants.environment_id',
        'config_variants.value',
        'config_variants.schema',
        'config_variants.overrides',
        'config_variants.created_at',
        'config_variants.updated_at',
        'config_variants.use_base_schema',
      ])
      .where('config_variants.id', '=', params.id)
      .where('configs.project_id', '=', params.projectId)
      .executeTakeFirst();

    if (!row) return null;

    return this.mapRow(row);
  }

  async getByConfigIdAndEnvironmentId(params: {
    configId: string;
    environmentId: string;
    projectId: string;
  }): Promise<ConfigVariant | null> {
    const row = await this.db
      .selectFrom('config_variants')
      .innerJoin('configs', 'configs.id', 'config_variants.config_id')
      .select([
        'config_variants.id',
        'config_variants.config_id',
        'config_variants.environment_id',
        'config_variants.value',
        'config_variants.schema',
        'config_variants.overrides',
        'config_variants.created_at',
        'config_variants.updated_at',
        'config_variants.use_base_schema',
      ])
      .where('config_variants.config_id', '=', params.configId)
      .where('config_variants.environment_id', '=', params.environmentId)
      .where('configs.project_id', '=', params.projectId)
      .executeTakeFirst();

    if (!row) return null;

    return this.mapRow(row);
  }

  async getByConfigId(params: {
    configId: string;
    projectId: string;
  }): Promise<(ConfigVariant & {environmentName: string})[]> {
    const rows = await this.db
      .selectFrom('config_variants as cv')
      .innerJoin('project_environments as pe', 'pe.id', 'cv.environment_id')
      .innerJoin('configs as c', 'c.id', 'cv.config_id')
      .select([
        'cv.id',
        'cv.config_id',
        'cv.environment_id',
        'cv.value',
        'cv.schema',
        'cv.overrides',
        'cv.created_at',
        'cv.updated_at',
        'cv.use_base_schema',
        'pe.name as environment_name',
      ])
      .where('cv.config_id', '=', params.configId)
      .where('c.project_id', '=', params.projectId)
      .orderBy('pe.order', 'asc')
      .execute();

    return rows.map(r => ({
      ...this.mapRow(r),
      environmentName: r.environment_name,
    }));
  }

  async deleteByEnvironmentId(params: {
    configId: string;
    environmentId: string;
    projectId: string;
  }): Promise<void> {
    await this.db
      .deleteFrom('config_variants')
      .where('config_id', '=', params.configId)
      .where('environment_id', '=', params.environmentId)
      .where(eb =>
        eb.exists(
          eb
            .selectFrom('configs')
            .select('configs.id')
            .where('configs.id', '=', eb.ref('config_variants.config_id'))
            .where('configs.project_id', '=', params.projectId),
        ),
      )
      .execute();

    // Note: We don't have a specific variant ID here, but the event bus will trigger a refresh
    // The caller should handle notifying the change
  }

  async getByEnvironmentId(params: {
    environmentId: string;
    projectId: string;
  }): Promise<ConfigVariant[]> {
    const rows = await this.db
      .selectFrom('config_variants')
      .innerJoin('configs', 'configs.id', 'config_variants.config_id')
      .select([
        'config_variants.id',
        'config_variants.config_id',
        'config_variants.environment_id',
        'config_variants.value',
        'config_variants.schema',
        'config_variants.overrides',
        'config_variants.created_at',
        'config_variants.updated_at',
        'config_variants.use_base_schema',
      ])
      .where('config_variants.environment_id', '=', params.environmentId)
      .where('configs.project_id', '=', params.projectId)
      .execute();

    return rows.map(this.mapRow);
  }

  async create(variant: ConfigVariant): Promise<void> {
    await this.db
      .insertInto('config_variants')
      .values({
        id: variant.id,
        config_id: variant.configId,
        environment_id: variant.environmentId,
        value: variant.value,
        schema: variant.schema,
        overrides: JSON.stringify(variant.overrides),
        created_at: variant.createdAt,
        updated_at: variant.updatedAt,
        use_base_schema: variant.useBaseSchema,
      })
      .execute();
  }

  async update(params: {
    id: string;
    configId: string;
    projectId: string;
    value?: unknown;
    schema?: unknown | null;
    overrides?: Override[];
    updatedAt: Date;
    useBaseSchema?: boolean;
  }): Promise<void> {
    const updateData: any = {
      updated_at: params.updatedAt,
    };

    if (params.value !== undefined) {
      updateData.value = params.value;
    }
    if (params.schema !== undefined) {
      updateData.schema = params.schema;
    }
    if (params.overrides !== undefined) {
      updateData.overrides = JSON.stringify(params.overrides);
    }
    if (params.useBaseSchema !== undefined) {
      updateData.use_base_schema = params.useBaseSchema;
    }

    await this.db
      .updateTable('config_variants')
      .set(updateData)
      .where('id', '=', params.id)
      .where(eb =>
        eb.exists(
          eb
            .selectFrom('configs')
            .select('configs.id')
            .where('configs.id', '=', eb.ref('config_variants.config_id'))
            .where('configs.project_id', '=', params.projectId),
        ),
      )
      .execute();
  }

  async delete(params: {configId: string; variantId: string; projectId: string}): Promise<void> {
    await this.db
      .deleteFrom('config_variants')
      .where('config_variants.id', '=', params.variantId)
      .where('config_variants.config_id', '=', params.configId)
      .where(eb =>
        eb.exists(
          eb
            .selectFrom('configs')
            .select('configs.id')
            .where('configs.id', '=', eb.ref('config_variants.config_id'))
            .where('configs.project_id', '=', params.projectId),
        ),
      )
      .execute();
  }

  private mapRow(row: {
    id: string;
    config_id: string;
    environment_id: string;
    value: string;
    schema: string | null;
    overrides: string;
    created_at: Date;
    updated_at: Date;
    use_base_schema: boolean;
  }): ConfigVariant {
    return {
      id: row.id,
      configId: row.config_id,
      environmentId: row.environment_id,
      value: row.value as ConfigValue,
      schema: row.schema as ConfigSchema | null,
      overrides: JSON.parse(row.overrides),
      createdAt: row.created_at,
      updatedAt: row.updated_at,
      useBaseSchema: row.use_base_schema,
    };
  }
}
