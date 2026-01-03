import type {Kysely} from 'kysely';
import type {ConfigUserRole, DB} from '../db';
import type {Override} from '../override-evaluator';
import {createUuidV7} from '../uuid';
import {type ConfigSchema, type ConfigValue} from '../zod';

export function createConfigVersionId() {
  return createUuidV7();
}

export function createConfigVersionVariantId() {
  return createUuidV7();
}

export function createConfigVersionMemberId() {
  return createUuidV7();
}

export interface ConfigVersionVariant {
  id: string;
  environmentId: string;
  value: ConfigValue;
  schema: ConfigSchema | null;
  overrides: Override[];
  useBaseSchema: boolean;
}

export interface ConfigVersionMember {
  id: string;
  email: string;
  role: ConfigUserRole;
}

export interface ConfigVersion {
  id: string;
  configId: string | null;
  configName: string;
  version: number;
  description: string;
  // Default variant data stored directly on version
  value: ConfigValue;
  schema: ConfigSchema | null;
  overrides: Override[];
  proposalId: string | null;
  authorId: number | null;
  createdAt: Date;
  // Environment-specific variants
  variants: ConfigVersionVariant[];
  // Member snapshots
  members: ConfigVersionMember[];
}

export class ConfigVersionStore {
  constructor(private readonly db: Kysely<DB>) {}

  async create(configVersion: ConfigVersion): Promise<ConfigVersion> {
    // Insert the version row
    await this.db
      .insertInto('config_versions')
      .values({
        id: configVersion.id,
        config_id: configVersion.configId,
        config_name: configVersion.configName,
        version: configVersion.version,
        description: configVersion.description,
        value: configVersion.value,
        schema: configVersion.schema !== null ? configVersion.schema : null,
        overrides: JSON.stringify(configVersion.overrides),
        proposal_id: configVersion.proposalId,
        author_id: configVersion.authorId,
        created_at: configVersion.createdAt,
      })
      .execute();

    // Insert variant rows
    if (configVersion.variants.length > 0) {
      const variantsToInsert = configVersion.variants.map(v => ({
        id: v.id,
        config_version_id: configVersion.id,
        environment_id: v.environmentId,
        value: v.value,
        schema: v.schema !== null ? v.schema : null,
        overrides: JSON.stringify(v.overrides),
        use_base_schema: v.useBaseSchema,
      }));

      await this.db.insertInto('config_version_variants').values(variantsToInsert).execute();
    }

    // Insert member rows
    if (configVersion.members.length > 0) {
      const membersToInsert = configVersion.members.map(m => ({
        id: m.id,
        config_version_id: configVersion.id,
        email: m.email,
        role: m.role,
      }));

      await this.db.insertInto('config_version_members').values(membersToInsert).execute();
    }

    return configVersion;
  }

  async getById(params: {id: string; projectId: string}): Promise<ConfigVersion | null> {
    const versionRow = await this.db
      .selectFrom('config_versions')
      .innerJoin('configs', 'configs.id', 'config_versions.config_id')
      .selectAll('config_versions')
      .where('config_versions.id', '=', params.id)
      .where('configs.project_id', '=', params.projectId)
      .executeTakeFirst();

    if (!versionRow) return null;

    return this.fetchOneVersionWithRelations(versionRow);
  }

  async getByConfigIdAndVersion(params: {
    configId: string;
    version: number;
    projectId: string;
  }): Promise<ConfigVersion | null> {
    const versionRow = await this.db
      .selectFrom('config_versions')
      .innerJoin('configs', 'configs.id', 'config_versions.config_id')
      .selectAll('config_versions')
      .where('config_versions.config_id', '=', params.configId)
      .where('config_versions.version', '=', params.version)
      .where('configs.project_id', '=', params.projectId)
      .executeTakeFirst();

    if (!versionRow) return null;

    return this.fetchOneVersionWithRelations(versionRow);
  }

  async getByConfigId(params: {configId: string; projectId: string}): Promise<ConfigVersion[]> {
    const versionRows = await this.db
      .selectFrom('config_versions')
      .innerJoin('configs', 'configs.id', 'config_versions.config_id')
      .selectAll('config_versions')
      .where('config_versions.config_id', '=', params.configId)
      .where('configs.project_id', '=', params.projectId)
      .orderBy('config_versions.version', 'desc')
      .execute();

    return this.fetchVersionsWithRelations(versionRows);
  }

  async getLatestByConfigId(params: {
    configId: string;
    projectId: string;
  }): Promise<ConfigVersion | null> {
    const versionRow = await this.db
      .selectFrom('config_versions')
      .innerJoin('configs', 'configs.id', 'config_versions.config_id')
      .selectAll('config_versions')
      .where('config_versions.config_id', '=', params.configId)
      .where('configs.project_id', '=', params.projectId)
      .orderBy('config_versions.version', 'desc')
      .limit(1)
      .executeTakeFirst();

    if (!versionRow) return null;

    return this.fetchOneVersionWithRelations(versionRow);
  }

  private async fetchOneVersionWithRelations(versionRow: {
    id: string;
    config_id: string | null;
    config_name: string;
    version: number;
    description: string;
    value: string;
    schema: string | null;
    overrides: string;
    proposal_id: string | null;
    author_id: number | null;
    created_at: Date;
  }): Promise<ConfigVersion | null> {
    const result = await this.fetchVersionsWithRelations([versionRow]);

    return result[0] ?? null;
  }

  private async fetchVersionsWithRelations(
    versionRows: Array<{
      id: string;
      config_id: string | null;
      config_name: string;
      version: number;
      description: string;
      value: string;
      schema: string | null;
      overrides: string;
      proposal_id: string | null;
      author_id: number | null;
      created_at: Date;
    }>,
  ): Promise<ConfigVersion[]> {
    if (versionRows.length === 0) return [];

    const versionIds = versionRows.map(r => r.id);

    // Batch fetch variants and members for all versions
    const [variantRows, memberRows] = await Promise.all([
      this.db
        .selectFrom('config_version_variants')
        .selectAll()
        .where('config_version_id', 'in', versionIds)
        .execute(),
      this.db
        .selectFrom('config_version_members')
        .selectAll()
        .where('config_version_id', 'in', versionIds)
        .execute(),
    ]);

    // Group by version id
    const variantsByVersionId = new Map<string, typeof variantRows>();
    for (const v of variantRows) {
      const existing = variantsByVersionId.get(v.config_version_id) ?? [];
      existing.push(v);
      variantsByVersionId.set(v.config_version_id, existing);
    }

    const membersByVersionId = new Map<string, typeof memberRows>();
    for (const m of memberRows) {
      const existing = membersByVersionId.get(m.config_version_id) ?? [];
      existing.push(m);
      membersByVersionId.set(m.config_version_id, existing);
    }

    return versionRows.map(versionRow => ({
      id: versionRow.id,
      configId: versionRow.config_id,
      configName: versionRow.config_name,
      version: versionRow.version,
      description: versionRow.description,
      value: versionRow.value as ConfigValue,
      schema: versionRow.schema as ConfigSchema | null,
      overrides: JSON.parse(versionRow.overrides),
      proposalId: versionRow.proposal_id,
      authorId: versionRow.author_id,
      createdAt: versionRow.created_at,
      variants: (variantsByVersionId.get(versionRow.id) ?? []).map(v => ({
        id: v.id,
        environmentId: v.environment_id,
        value: v.value as ConfigValue,
        schema: v.schema as ConfigSchema | null,
        overrides: JSON.parse(v.overrides),
        useBaseSchema: v.use_base_schema,
      })),
      members: (membersByVersionId.get(versionRow.id) ?? []).map(m => ({
        id: m.id,
        email: m.email,
        role: m.role,
      })),
    }));
  }
}
