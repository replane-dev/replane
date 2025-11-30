import type {Kysely} from 'kysely';
import type {DB} from '../db';
import type {EventBusClient} from '../event-bus';
import type {Override} from '../override-evaluator';
import {deserializeJson, serializeJson} from '../store-utils';

export interface ConfigVariant {
  id: string;
  configId: string;
  environmentId: string;
  value: unknown;
  schema: unknown | null;
  overrides: Override[];
  version: number;
  createdAt: Date;
  updatedAt: Date;
}

export class ConfigVariantStore {
  constructor(
    private readonly db: Kysely<DB>,
    private readonly scheduleOptimisticEffect: (effect: () => Promise<void>) => void,
    private readonly eventBusClient: EventBusClient<ConfigVariantChangePayload>,
  ) {}

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

  async getByConfigId(configId: string): Promise<(ConfigVariant & {environmentName: string})[]> {
    const rows = await this.db
      .selectFrom('config_variants as cv')
      .innerJoin('project_environments as pe', 'pe.id', 'cv.environment_id')
      .select([
        'cv.id',
        'cv.config_id',
        'cv.environment_id',
        'cv.value',
        'cv.schema',
        'cv.overrides',
        'cv.version',
        'cv.created_at',
        'cv.updated_at',
        'pe.name as environment_name',
      ])
      .where('cv.config_id', '=', configId)
      .orderBy('pe.order', 'asc')
      .execute();

    return rows.map(r => ({
      ...this.mapRow(r),
      environmentName: r.environment_name,
    }));
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
        version: variant.version,
        created_at: variant.createdAt,
        updated_at: variant.updatedAt,
      })
      .execute();

    this.notifyConfigChange({variantId: variant.id});
  }

  async update(params: {
    id: string;
    value?: unknown;
    schema?: unknown | null;
    overrides?: Override[];
    version: number;
    updatedAt: Date;
  }): Promise<void> {
    const updateData: any = {
      version: params.version,
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

    await this.db
      .updateTable('config_variants')
      .set(updateData)
      .where('id', '=', params.id)
      .execute();

    this.notifyConfigChange({variantId: params.id});
  }

  async delete(id: string): Promise<void> {
    await this.db.deleteFrom('config_variants').where('id', '=', id).execute();

    this.notifyConfigChange({variantId: id});
  }

  private mapRow(row: {
    id: string;
    config_id: string;
    environment_id: string;
    value: string;
    schema: string | null;
    overrides: string;
    version: number;
    created_at: Date;
    updated_at: Date;
  }): ConfigVariant {
    return {
      id: row.id,
      configId: row.config_id,
      environmentId: row.environment_id,
      value: deserializeJson(row.value),
      schema: row.schema ? deserializeJson(row.schema) : null,
      overrides: deserializeJson(row.overrides) ?? [],
      version: row.version,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    };
  }

  private notifyConfigChange(payload: ConfigVariantChangePayload): void {
    this.scheduleOptimisticEffect(async () => {
      await this.eventBusClient.notify(payload);
    });
  }
}

export interface ConfigVariantChangePayload {
  variantId: string;
}
