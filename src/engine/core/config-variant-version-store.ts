import type {Kysely} from 'kysely';
import type {DB} from './db';
import type {Override} from './override-evaluator';
import {deserializeJson, serializeJson} from './store-utils';
import {createUuidV7} from './uuid';

export function createConfigVariantVersionId() {
  return createUuidV7();
}

export interface ConfigVariantVersion {
  id: string;
  configVariantId: string;
  version: number;
  name: string;
  description: string;
  value: unknown;
  schema: unknown | null;
  overrides: Override[];  // NOT NULL - use [] for empty
  authorId: number | null;
  proposalId: string | null;
  createdAt: Date;
  // Note: Does NOT store member snapshots (members are config-level)
}

export interface ConfigVariantVersionWithAuthor {
  id: string;
  configVariantId: string;
  version: number;
  name: string;
  description: string;
  value: unknown;
  schema: unknown | null;
  overrides: Override[];
  authorId: number | null;
  authorEmail: string | null;
  proposalId: string | null;
  createdAt: Date;
}

export class ConfigVariantVersionStore {
  constructor(private readonly db: Kysely<DB>) {}

  async getById(id: string): Promise<ConfigVariantVersion | null> {
    const row = await this.db
      .selectFrom('config_variant_versions')
      .selectAll()
      .where('id', '=', id)
      .executeTakeFirst();

    if (!row) return null;

    return this.mapRow(row);
  }

  async getByConfigVariantId(configVariantId: string): Promise<ConfigVariantVersion[]> {
    const rows = await this.db
      .selectFrom('config_variant_versions')
      .selectAll()
      .where('config_variant_id', '=', configVariantId)
      .orderBy('version', 'desc')
      .execute();

    return rows.map(this.mapRow);
  }

  async getByConfigVariantIdWithAuthors(
    configVariantId: string,
  ): Promise<ConfigVariantVersionWithAuthor[]> {
    const rows = await this.db
      .selectFrom('config_variant_versions as cvv')
      .leftJoin('users as u', 'u.id', 'cvv.author_id')
      .select([
        'cvv.id as id',
        'cvv.config_variant_id as config_variant_id',
        'cvv.version as version',
        'cvv.name as name',
        'cvv.description as description',
        'cvv.value as value',
        'cvv.schema as schema',
        'cvv.overrides as overrides',
        'cvv.author_id as author_id',
        'cvv.proposal_id as proposal_id',
        'cvv.created_at as created_at',
        'u.email as author_email',
      ])
      .where('cvv.config_variant_id', '=', configVariantId)
      .orderBy('cvv.version', 'desc')
      .execute();

    return rows.map(row => ({
      id: row.id,
      configVariantId: row.config_variant_id,
      version: row.version,
      name: row.name,
      description: row.description,
      value: deserializeJson(row.value),
      schema: row.schema ? deserializeJson(row.schema) : null,
      overrides: row.overrides ? (deserializeJson(row.overrides) ?? []) : [],
      authorId: row.author_id,
      authorEmail: row.author_email ?? null,
      proposalId: row.proposal_id,
      createdAt: row.created_at,
    }));
  }

  async getByConfigVariantIdAndVersion(params: {
    configVariantId: string;
    version: number;
  }): Promise<ConfigVariantVersion | null> {
    const row = await this.db
      .selectFrom('config_variant_versions')
      .selectAll()
      .where('config_variant_id', '=', params.configVariantId)
      .where('version', '=', params.version)
      .executeTakeFirst();

    if (!row) return null;

    return this.mapRow(row);
  }

  async getByConfigVariantIdAndVersionWithAuthor(params: {
    configVariantId: string;
    version: number;
  }): Promise<ConfigVariantVersionWithAuthor | null> {
    const row = await this.db
      .selectFrom('config_variant_versions as cvv')
      .leftJoin('users as u', 'u.id', 'cvv.author_id')
      .select([
        'cvv.id as id',
        'cvv.config_variant_id as config_variant_id',
        'cvv.version as version',
        'cvv.name as name',
        'cvv.description as description',
        'cvv.value as value',
        'cvv.schema as schema',
        'cvv.overrides as overrides',
        'cvv.author_id as author_id',
        'cvv.proposal_id as proposal_id',
        'cvv.created_at as created_at',
        'u.email as author_email',
      ])
      .where('cvv.config_variant_id', '=', params.configVariantId)
      .where('cvv.version', '=', params.version)
      .executeTakeFirst();

    if (!row) return null;

    return {
      id: row.id,
      configVariantId: row.config_variant_id,
      version: row.version,
      name: row.name,
      description: row.description,
      value: deserializeJson(row.value),
      schema: row.schema ? deserializeJson(row.schema) : null,
      overrides: row.overrides ? (deserializeJson(row.overrides) ?? []) : [],
      authorId: row.author_id,
      authorEmail: row.author_email ?? null,
      proposalId: row.proposal_id,
      createdAt: row.created_at,
    };
  }

  async create(version: ConfigVariantVersion): Promise<void> {
    await this.db
      .insertInto('config_variant_versions')
      .values({
        id: version.id,
        config_variant_id: version.configVariantId,
        version: version.version,
        name: version.name,
        description: version.description,
        value: serializeJson(version.value),
        schema: serializeJson(version.schema),
        overrides: serializeJson(version.overrides),
        author_id: version.authorId,
        proposal_id: version.proposalId,
        created_at: version.createdAt,
      })
      .execute();
  }

  private mapRow(row: {
    id: string;
    config_variant_id: string;
    version: number;
    name: string;
    description: string;
    value: string;
    schema: string | null;
    overrides: string | null;
    author_id: number | null;
    proposal_id: string | null;
    created_at: Date;
  }): ConfigVariantVersion {
    return {
      id: row.id,
      configVariantId: row.config_variant_id,
      version: row.version,
      name: row.name,
      description: row.description,
      value: deserializeJson(row.value),
      schema: row.schema ? deserializeJson(row.schema) : null,
      overrides: row.overrides ? (deserializeJson(row.overrides) ?? []) : [],
      authorId: row.author_id,
      proposalId: row.proposal_id,
      createdAt: row.created_at,
    };
  }
}
