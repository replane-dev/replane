import type {Kysely} from 'kysely';
import type {DB} from '../db';
import type {Override} from '../override-evaluator';
import {deserializeJson, serializeJson} from '../store-utils';

export interface ConfigVariant {
  id: string;
  configId: string;
  environmentId: string | null;
  value: unknown;
  schema: unknown | null;
  overrides: Override[];
  createdAt: Date;
  updatedAt: Date;
  useDefaultSchema: boolean;
}

export class ConfigVariantStore {
  constructor(private readonly db: Kysely<DB>) {}

  async getById(id: string): Promise<ConfigVariant | null> {
    const row = await this.db
      .selectFrom('config_variants')
      .selectAll()
      .where('id', '=', id)
      .executeTakeFirst();

    if (!row) return null;

    return this.mapRow(row);
  }

  async getByConfigIdAndEnvironmentId(params: {
    configId: string;
    environmentId: string;
  }): Promise<ConfigVariant | null> {
    const row = await this.db
      .selectFrom('config_variants')
      .selectAll()
      .where('config_id', '=', params.configId)
      .where('environment_id', '=', params.environmentId)
      .executeTakeFirst();

    if (!row) return null;

    return this.mapRow(row);
  }

  async getByConfigId(
    configId: string,
  ): Promise<(ConfigVariant & {environmentName: string | null})[]> {
    const rows = await this.db
      .selectFrom('config_variants as cv')
      .leftJoin('project_environments as pe', 'pe.id', 'cv.environment_id')
      .select([
        'cv.id',
        'cv.config_id',
        'cv.environment_id',
        'cv.value',
        'cv.schema',
        'cv.overrides',
        'cv.created_at',
        'cv.updated_at',
        'cv.use_default_schema',
        'pe.name as environment_name',
      ])
      .where('cv.config_id', '=', configId)
      .orderBy('pe.order', 'asc')
      .execute();

    return rows.map(r => ({
      ...this.mapRow(r),
      environmentName: r.environment_name ?? null,
    }));
  }

  async getDefaultVariant(configId: string): Promise<ConfigVariant | null> {
    const row = await this.db
      .selectFrom('config_variants')
      .selectAll()
      .where('config_id', '=', configId)
      .where('environment_id', 'is', null)
      .executeTakeFirst();

    if (!row) return null;

    return this.mapRow(row);
  }

  async deleteByEnvironmentId(params: {configId: string; environmentId: string}): Promise<void> {
    await this.db
      .deleteFrom('config_variants')
      .where('config_id', '=', params.configId)
      .where('environment_id', '=', params.environmentId)
      .execute();

    // Note: We don't have a specific variant ID here, but the event bus will trigger a refresh
    // The caller should handle notifying the change
  }

  async getByEnvironmentId(environmentId: string): Promise<ConfigVariant[]> {
    const rows = await this.db
      .selectFrom('config_variants')
      .selectAll()
      .where('environment_id', '=', environmentId)
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
        value: serializeJson(variant.value),
        schema: serializeJson(variant.schema),
        overrides: serializeJson(variant.overrides),
        created_at: variant.createdAt,
        updated_at: variant.updatedAt,
        use_default_schema: variant.useDefaultSchema,
      })
      .execute();
  }

  async update(params: {
    id: string;
    configId: string;
    value?: unknown;
    schema?: unknown | null;
    overrides?: Override[];
    updatedAt: Date;
    useDefaultSchema?: boolean;
  }): Promise<void> {
    const updateData: any = {
      updated_at: params.updatedAt,
    };

    if (params.value !== undefined) {
      updateData.value = serializeJson(params.value);
    }
    if (params.schema !== undefined) {
      updateData.schema = serializeJson(params.schema);
    }
    if (params.overrides !== undefined) {
      updateData.overrides = serializeJson(params.overrides);
    }
    if (params.useDefaultSchema !== undefined) {
      updateData.use_default_schema = params.useDefaultSchema;
    }

    await this.db
      .updateTable('config_variants')
      .set(updateData)
      .where('id', '=', params.id)
      .execute();
  }

  async delete(params: {configId: string; variantId: string}): Promise<void> {
    await this.db
      .deleteFrom('config_variants')
      .where('config_variants.id', '=', params.variantId)
      .where('config_variants.config_id', '=', params.configId)
      .execute();
  }

  private mapRow(row: {
    id: string;
    config_id: string;
    environment_id: string | null;
    value: string;
    schema: string | null;
    overrides: string;
    created_at: Date;
    updated_at: Date;
    use_default_schema: boolean;
  }): ConfigVariant {
    return {
      id: row.id,
      configId: row.config_id,
      environmentId: row.environment_id,
      value: deserializeJson(row.value),
      schema: row.schema ? deserializeJson(row.schema) : null,
      overrides: deserializeJson(row.overrides) ?? [],
      createdAt: row.created_at,
      updatedAt: row.updated_at,
      useDefaultSchema: row.use_default_schema,
    };
  }
}
