import assert from 'assert';
import {type Database, type Statement} from 'better-sqlite3';
import type {Override} from '../override-condition-schemas';
import type {ConfigValue} from '../zod';

export interface ConfigReplica {
  id: string;
  projectId: string;
  name: string;
  version: number;
  variants: ConfigVariantReplica[];
  defaultVariant: ConfigVariantReplica | null;
}

export interface ConfigVariantReplica {
  id: string;
  configId: string;
  environmentId: string | null;
  value: ConfigValue;
  overrides: Override[];
}

export interface EnvironmentalConfigReplica {
  projectId: string;
  name: string;
  version: number;
  environmentId: string;
  value: ConfigValue;
  overrides: Override[];
}

const CONSUMER_ID_KEY = 'consumer_id';

export class ReplicaStore {
  private db: Database;

  static create(db: Database) {
    db.exec(/*sql*/ `
      CREATE TABLE IF NOT EXISTS configs (
        id TEXT PRIMARY KEY,
        project_id TEXT NOT NULL,
        name TEXT NOT NULL,
        version INTEGER NOT NULL
      );
      `);
    db.exec(/*sql*/ `
      CREATE TABLE IF NOT EXISTS config_variants (
        id TEXT PRIMARY KEY,
        config_id TEXT NOT NULL REFERENCES configs(id) ON DELETE CASCADE,
        environment_id TEXT NULL,
        value TEXT NOT NULL,
        overrides TEXT NOT NULL
      );
    `);
    db.exec(/*sql*/ `
      CREATE UNIQUE INDEX IF NOT EXISTS idx_configs_project_id_name ON configs(project_id, name);
    `);
    db.exec(/*sql*/ `
      CREATE UNIQUE INDEX IF NOT EXISTS idx_config_variants_config_id_environment_id ON config_variants(config_id, environment_id);
    `);
    db.exec(/*sql*/ `
      CREATE TABLE IF NOT EXISTS kv (
        key TEXT PRIMARY KEY,
        value TEXT NOT NULL
      );
    `);

    const store = new ReplicaStore(db);

    return store;
  }

  private insertConfigVariant: Statement<
    {id: string; configId: string; environmentId: string | null; value: string; overrides: string},
    void
  >;

  private getConfigVersionById: Statement<{id: string}, {version: number}>;

  private insertConfig: Statement<
    {id: string; projectId: string; name: string; version: number},
    void
  >;

  private getProjectConfigsStmt: Statement<
    {projectId: string; environmentId: string},
    {
      projectId: string;
      name: string;
      version: number;
      value: string | null;
      overrides: string | null;
    }
  >;

  private getEnvironmentalConfigStmt: Statement<
    {projectId: string; environmentId: string; configName: string},
    {
      projectId: string;
      name: string;
      version: number;
      value: string | null;
      overrides: string | null;
    }
  >;

  private getConfigByIdStmt: Statement<
    {configId: string},
    {id: string; projectId: string; name: string; version: number}
  >;

  private getConfigValueStmt: Statement<
    {projectId: string; environmentId: string; configName: string},
    {value: string | null}
  >;

  private deleteConfigStmt: Statement<{id: string}, void>;

  private insertKv: Statement<{key: string; value: string}, void>;

  private getKvStmt: Statement<{key: string}, {value: string}>;

  private clearConfigsStmt: Statement<{}, void>;
  private clearConfigVariantsStmt: Statement<{}, void>;
  private clearKvStmt: Statement<{}, void>;

  private constructor(db: Database) {
    this.db = db;
    this.insertConfigVariant = db.prepare<
      {
        id: string;
        configId: string;
        environmentId: string | null;
        value: string;
        overrides: string;
      },
      void
    >(/*sql*/ `
      INSERT INTO config_variants (id, config_id, environment_id, value, overrides)
      VALUES (@id, @configId, @environmentId, @value, @overrides)
    `);

    this.getConfigVersionById = db.prepare<{id: string}, {version: number}>(/*sql*/ `
      SELECT version FROM configs WHERE id = @id
    `);

    this.insertConfig = db.prepare<
      {id: string; projectId: string; name: string; version: number},
      void
    >(/*sql*/ `
      INSERT INTO configs (id, project_id, name, version)
      VALUES (@id, @projectId, @name, @version)
    `);

    this.getProjectConfigsStmt = db.prepare<
      {projectId: string; environmentId: string},
      {
        projectId: string;
        name: string;
        version: number;
        value: string | null;
        overrides: string | null;
      }
    >(/*sql*/ `
      SELECT
        c.id as config_id,
        c.project_id,
        c.name,
        c.version,
        COALESCE(cv.value, cv_default.value) as value,
        COALESCE(cv.overrides, cv_default.overrides) as overrides
      FROM configs c
      LEFT JOIN config_variants cv ON cv.config_id = c.id AND cv.environment_id = @environmentId
      LEFT JOIN config_variants cv_default ON cv_default.config_id = c.id AND cv_default.environment_id IS NULL
      WHERE c.project_id = @projectId
    `);

    this.getEnvironmentalConfigStmt = db.prepare<
      {projectId: string; environmentId: string; configName: string},
      {
        projectId: string;
        name: string;
        version: number;
        value: string | null;
        overrides: string | null;
      }
    >(/*sql*/ `
      SELECT
        c.id as config_id,
        c.project_id,
        c.name,
        c.version,
        COALESCE(cv.value, cv_default.value) as value,
        COALESCE(cv.overrides, cv_default.overrides) as overrides
      FROM configs c
      LEFT JOIN config_variants cv ON cv.config_id = c.id AND cv.environment_id = @environmentId
      LEFT JOIN config_variants cv_default ON cv_default.config_id = c.id AND cv_default.environment_id IS NULL
      WHERE c.project_id = @projectId AND c.name = @configName
    `);

    this.getConfigByIdStmt = db.prepare<
      {configId: string},
      {id: string; projectId: string; name: string; version: number}
    >(/*sql*/ `
      SELECT
        c.id,
        c.project_id,
        c.name,
        c.version
      FROM configs c
      WHERE c.id = @configId
    `);

    this.getConfigValueStmt = db.prepare<
      {projectId: string; environmentId: string; configName: string},
      {value: string | null}
    >(/*sql*/ `
      SELECT
        COALESCE(cv.value, cv_default.value) as value
      FROM configs c
      LEFT JOIN config_variants cv ON cv.config_id = c.id AND cv.environment_id = @environmentId
      LEFT JOIN config_variants cv_default ON cv_default.config_id = c.id AND cv_default.environment_id IS NULL
      WHERE c.project_id = @projectId AND c.name = @configName
    `);

    this.deleteConfigStmt = db.prepare<{id: string}, void>(/*sql*/ `
      DELETE FROM configs WHERE id = @id
    `);

    this.insertKv = db.prepare<{key: string; value: string}, void>(/*sql*/ `
      INSERT INTO kv (key, value)
      VALUES (@key, @value)
    `);

    this.getKvStmt = db.prepare<{key: string}, {value: string}>(/*sql*/ `
      SELECT value FROM kv WHERE key = @key
    `);

    this.clearConfigsStmt = db.prepare<{}, void>(/*sql*/ `
      DELETE FROM configs
    `);

    this.clearConfigVariantsStmt = db.prepare<{}, void>(/*sql*/ `
      DELETE FROM config_variants
    `);

    this.clearKvStmt = db.prepare<{}, void>(/*sql*/ `
      DELETE FROM kv
    `);
  }

  getProjectConfigs(params: {projectId: string; environmentId: string}) {
    const configs = this.getProjectConfigsStmt.all(params);

    return configs.map(config => {
      assert(typeof config.value === 'string', 'Value must be a string');
      assert(typeof config.overrides === 'string', 'Overrides must be a string');

      return {
        name: config.name,
        version: config.version,
        environmentId: params.environmentId,
        value: JSON.parse(config.value) as ConfigValue,
        overrides: JSON.parse(config.overrides) as Override[],
        projectId: config.projectId,
      };
    });
  }

  getConfigById(id: string) {
    const config = this.getConfigByIdStmt.get({configId: id});
    if (!config) {
      return undefined;
    }

    return {
      id: config.id,
      projectId: config.projectId,
      name: config.name,
      version: config.version,
    };
  }

  getEnvironmentalConfig(params: {
    projectId: string;
    configName: string;
    environmentId: string;
  }): EnvironmentalConfigReplica | undefined {
    const config = this.getEnvironmentalConfigStmt.get({
      projectId: params.projectId,
      configName: params.configName,
      environmentId: params.environmentId,
    });
    if (!config) {
      return undefined;
    }

    assert(typeof config.value === 'string', 'Value must be a string');
    assert(typeof config.overrides === 'string', 'Overrides must be a string');

    return {
      name: config.name,
      version: config.version,
      environmentId: params.environmentId,
      value: JSON.parse(config.value) as ConfigValue,
      overrides: JSON.parse(config.overrides) as Override[],
      projectId: config.projectId,
    };
  }

  getConfigValue(params: {
    configName: string;
    projectId: string;
    environmentId: string;
  }): ConfigValue | undefined {
    const config = this.getConfigValueStmt.get(params);

    if (!config) {
      return undefined;
    }

    assert(config.value !== null, 'Value must not be null');
    return JSON.parse(config.value) as ConfigValue;
  }

  deleteConfig(id: string) {
    this.deleteConfigStmt.run({id});
  }

  getConsumerId() {
    return this.getKv(CONSUMER_ID_KEY);
  }

  insertConsumerId(consumerId: string) {
    this.setKv(CONSUMER_ID_KEY, consumerId);
  }

  private setKv(key: string, value: string) {
    this.insertKv.run({key, value});
  }

  private getKv(key: string) {
    return this.getKvStmt.get({key})?.value;
  }

  clear() {
    this.transaction(() => {
      this.clearUnsafe();
    });
  }

  private clearUnsafe() {
    this.clearConfigsStmt.run({});
    this.clearConfigVariantsStmt.run({});
    this.clearKvStmt.run({});
  }

  upsertConfigs(configs: ConfigReplica[]) {
    return this.transaction(() => {
      return configs.map(config => this.upsertConfigUnsafe(config));
    });
  }

  private upsertConfigUnsafe(config: ConfigReplica): 'created' | 'updated' | 'ignored' {
    const existingConfigVersion = this.getConfigVersionById.get({id: config.id});

    if (existingConfigVersion && existingConfigVersion.version >= config.version) {
      return 'ignored';
    }

    if (existingConfigVersion) {
      // delete existing config
      this.deleteConfigStmt.run({id: config.id});
    }

    // insert new config
    this.insertConfig.run({
      id: config.id,
      projectId: config.projectId,
      name: config.name,
      version: config.version,
    });

    // insert new variants
    for (const variant of config.variants) {
      this.insertConfigVariant.run({
        id: variant.id,
        configId: config.id,
        environmentId: variant.environmentId,
        value: JSON.stringify(variant.value),
        overrides: JSON.stringify(variant.overrides),
      });
    }

    // insert default variant
    if (config.defaultVariant) {
      this.insertConfigVariant.run({
        id: config.defaultVariant.id,
        configId: config.id,
        environmentId: config.defaultVariant.environmentId,
        value: JSON.stringify(config.defaultVariant.value),
        overrides: JSON.stringify(config.defaultVariant.overrides),
      });
    }

    return existingConfigVersion ? 'updated' : 'created';
  }

  private transaction<T>(callback: () => T): T {
    return this.db.transaction(() => {
      return callback();
    })();
  }
}
