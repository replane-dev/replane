import {type Database, type Statement} from 'better-sqlite3';
import {v4 as uuidV4} from 'uuid';
import type {Override} from '../override-condition-schemas';
import {isDeepEqual, uniqueBy} from '../utils';
import {extractOverrideReferences} from '../validate-override-references';
import type {ConfigValue} from '../zod';

export interface SdkKeyReplica {
  id: string;
  projectId: string;
  name: string;
  keyHash: string;
  environmentId: string;
}

export interface ConfigReplica {
  id: string;
  projectId: string;
  name: string;
  value: ConfigValue;
  overrides: Override[];
  version: number;
  variants: ConfigVariantReplica[];
}

export interface ConfigVariantReplica {
  id: string;
  configId: string;
  environmentId: string;
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

export interface ConfigReferenceReplica {
  configId: string;
  referenceProjectId: string;
  referenceConfigName: string;
}

const CONFIGS_CONSUMER_ID_KEY = 'configs_consumer_id';
const SDK_KEYS_CONSUMER_ID_KEY = 'sdk_keys_consumer_id';

export class ReplicaStore {
  private db: Database;

  static create(db: Database) {
    db.exec(/*sql*/ `
      CREATE TABLE IF NOT EXISTS configs (
        id TEXT PRIMARY KEY,
        project_id TEXT NOT NULL,
        value TEXT NOT NULL,
        overrides TEXT NOT NULL,
        name TEXT NOT NULL,
        version INTEGER NOT NULL
      );
      `);
    db.exec(/*sql*/ `
      CREATE TABLE IF NOT EXISTS config_variants (
        id TEXT PRIMARY KEY,
        config_id TEXT NOT NULL REFERENCES configs(id) ON DELETE CASCADE,
        environment_id TEXT NOT NULL,
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
    db.exec(/*sql*/ `
      CREATE TABLE IF NOT EXISTS sdk_keys (
        id TEXT PRIMARY KEY,
        project_id TEXT NOT NULL,
        environment_id TEXT NOT NULL,
        name TEXT NOT NULL,
        key_hash TEXT NOT NULL
      );
    `);
    db.exec(/*sql*/ `
      CREATE TABLE IF NOT EXISTS config_references (
        id TEXT PRIMARY KEY,
        config_id TEXT NOT NULL REFERENCES configs(id) ON DELETE CASCADE,
        reference_project_id TEXT NOT NULL,
        reference_config_name TEXT NOT NULL
      );
    `);
    db.exec(/*sql*/ `
      CREATE UNIQUE INDEX IF NOT EXISTS idx_config_references_config_id_reference_project_id_reference_config_name ON config_references(config_id, reference_project_id, reference_config_name);
    `);
    db.exec(/*sql*/ `
      CREATE INDEX IF NOT EXISTS idx_config_references_project_id_config_name ON config_references(reference_project_id, reference_config_name);
    `);
    db.exec(/*sql*/ `
      CREATE INDEX IF NOT EXISTS idx_config_references_reference_project_id_reference_config_name ON config_references(reference_project_id, reference_config_name);
    `);

    const store = new ReplicaStore(db);

    return store;
  }

  private insertConfigReferenceStmt: Statement<
    {id: string; configId: string; referenceProjectId: string; referenceConfigName: string},
    void
  >;

  private getConfigReferencesStmt: Statement<
    {projectId: string; configName: string},
    {id: string; config_id: string; reference_project_id: string; reference_config_name: string}
  >;

  private insertSdkKeyStmt: Statement<
    {id: string; projectId: string; environmentId: string; name: string; keyHash: string},
    void
  >;
  private getSdkKeyByIdStmt: Statement<
    {id: string},
    {id: string; project_id: string; environment_id: string; name: string; key_hash: string}
  >;
  private deleteSdkKeyStmt: Statement<{id: string}, void>;

  private insertConfigVariant: Statement<
    {id: string; configId: string; environmentId: string; value: string; overrides: string},
    void
  >;

  private getConfigVersionById: Statement<{id: string}, {version: number}>;

  private insertConfig: Statement<
    {
      id: string;
      projectId: string;
      name: string;
      version: number;
      value: string;
      overrides: string;
    },
    void
  >;

  private getProjectConfigsStmt: Statement<
    {projectId: string; environmentId: string},
    {
      projectId: string;
      name: string;
      version: number;
      value: string;
      overrides: string;
    }
  >;

  private getEnvironmentalConfigStmt: Statement<
    {projectId: string; environmentId: string; configName: string},
    {
      project_id: string;
      name: string;
      version: number;
      value: string;
      overrides: string;
    }
  >;

  private getConfigByIdStmt: Statement<
    {configId: string},
    {
      id: string;
      project_id: string;
      name: string;
      version: number;
      value: string;
      overrides: string;
    }
  >;

  private getConfigValueStmt: Statement<
    {projectId: string; environmentId: string; configName: string},
    {value: string}
  >;

  private deleteConfigStmt: Statement<{id: string}, void>;

  private getKvStmt: Statement<{key: string}, {value: string}>;
  private insertKvStmt: Statement<{key: string; value: string}, void>;
  private deleteKvStmt: Statement<{key: string}, void>;

  private clearConfigsStmt: Statement<{}, void>;
  private clearConfigVariantsStmt: Statement<{}, void>;

  private clearSdkKeysStmt: Statement<{}, void>;

  private getConfigVariantsByConfigIdStmt: Statement<
    {configId: string},
    {id: string; environmentId: string; value: string; overrides: string}
  >;

  private constructor(db: Database) {
    this.db = db;

    this.insertConfigReferenceStmt = db.prepare<
      {id: string; configId: string; referenceProjectId: string; referenceConfigName: string},
      void
    >(/*sql*/ `
      INSERT INTO config_references (id, config_id, reference_project_id, reference_config_name)
      VALUES (@id, @configId, @referenceProjectId, @referenceConfigName)
    `);

    this.getConfigReferencesStmt = db.prepare<
      {projectId: string; configName: string},
      {id: string; config_id: string; reference_project_id: string; reference_config_name: string}
    >(/*sql*/ `
      SELECT id, config_id, reference_project_id, reference_config_name
      FROM config_references
      WHERE reference_project_id = @projectId
        AND reference_config_name = @configName
    `);

    this.clearSdkKeysStmt = db.prepare<{}, void>(/*sql*/ `
      DELETE FROM sdk_keys
    `);

    this.deleteKvStmt = db.prepare<{key: string}, void>(/*sql*/ `
      DELETE FROM kv WHERE key = @key
    `);

    this.insertSdkKeyStmt = db.prepare<
      {id: string; projectId: string; environmentId: string; name: string; keyHash: string},
      void
    >(/*sql*/ `
      INSERT INTO sdk_keys (id, project_id, environment_id, name, key_hash)
      VALUES (@id, @projectId, @environmentId, @name, @keyHash)
    `);

    this.getSdkKeyByIdStmt = db.prepare<
      {id: string},
      {id: string; project_id: string; environment_id: string; name: string; key_hash: string}
    >(/*sql*/ `
      SELECT id, project_id, environment_id, name, key_hash FROM sdk_keys WHERE id = @id
    `);

    this.deleteSdkKeyStmt = db.prepare<{id: string}, void>(/*sql*/ `
      DELETE FROM sdk_keys WHERE id = @id
    `);

    this.insertConfigVariant = db.prepare<
      {
        id: string;
        configId: string;
        environmentId: string;
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
      {
        id: string;
        projectId: string;
        name: string;
        version: number;
        value: string;
        overrides: string;
      },
      void
    >(/*sql*/ `
      INSERT INTO configs (id, project_id, name, version, value, overrides)
      VALUES (@id, @projectId, @name, @version, @value, @overrides)
    `);

    this.getProjectConfigsStmt = db.prepare<
      {projectId: string; environmentId: string},
      {
        projectId: string;
        name: string;
        version: number;
        value: string;
        overrides: string;
      }
    >(/*sql*/ `
      SELECT
        c.id as config_id,
        c.project_id,
        c.name,
        c.version,
        COALESCE(cv.value, c.value) as value,
        COALESCE(cv.overrides, c.overrides) as overrides
      FROM configs c
      LEFT JOIN config_variants cv ON cv.config_id = c.id AND cv.environment_id = @environmentId
      WHERE c.project_id = @projectId
    `);

    this.getEnvironmentalConfigStmt = db.prepare<
      {projectId: string; environmentId: string; configName: string},
      {
        project_id: string;
        name: string;
        version: number;
        value: string;
        overrides: string;
      }
    >(/*sql*/ `
      SELECT
        c.project_id,
        c.name,
        c.version,
        COALESCE(cv.value, c.value) as value,
        COALESCE(cv.overrides, c.overrides) as overrides
      FROM configs c
      LEFT JOIN config_variants cv ON cv.config_id = c.id AND cv.environment_id = @environmentId
      WHERE c.project_id = @projectId AND c.name = @configName
    `);

    this.getConfigByIdStmt = db.prepare<
      {configId: string},
      {
        id: string;
        project_id: string;
        name: string;
        version: number;
        value: string;
        overrides: string;
      }
    >(/*sql*/ `
      SELECT
        c.id,
        c.project_id,
        c.name,
        c.version,
        c.value,
        c.overrides
      FROM configs c
      WHERE c.id = @configId
    `);

    this.getConfigValueStmt = db.prepare<
      {projectId: string; environmentId: string; configName: string},
      {value: string}
    >(/*sql*/ `
      SELECT
        COALESCE(cv.value, c.value) as value
      FROM configs c
      LEFT JOIN config_variants cv ON cv.config_id = c.id AND cv.environment_id = @environmentId
      WHERE c.project_id = @projectId AND c.name = @configName
    `);

    this.deleteConfigStmt = db.prepare<{id: string}, void>(/*sql*/ `
      DELETE FROM configs WHERE id = @id
    `);

    this.insertKvStmt = db.prepare<{key: string; value: string}, void>(/*sql*/ `
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

    this.getConfigVariantsByConfigIdStmt = db.prepare<
      {configId: string},
      {id: string; environmentId: string; value: string; overrides: string}
    >(/*sql*/ `
      SELECT id, environment_id, value, overrides FROM config_variants WHERE config_id = @configId
    `);
  }

  getSdkKeyById(id: string): SdkKeyReplica | undefined {
    const result = this.getSdkKeyByIdStmt.get({id});
    if (!result) {
      return undefined;
    }

    return {
      id: result.id,
      projectId: result.project_id,
      environmentId: result.environment_id,
      name: result.name,
      keyHash: result.key_hash,
    };
  }

  deleteSdkKey(id: string) {
    return this.transaction(() => {
      return this.deleteSdkKeyUnsafe(id);
    });
  }

  deleteSdkKeyUnsafe(id: string): {type: 'ignored'} | {type: 'deleted'; entity: SdkKeyReplica} {
    const existingSdkKey = this.getSdkKeyByIdStmt.get({id});
    if (!existingSdkKey) {
      return {type: 'ignored'};
    }

    this.deleteSdkKeyStmt.run({id});
    return {
      type: 'deleted',
      entity: {
        id: existingSdkKey.id,
        projectId: existingSdkKey.project_id,
        environmentId: existingSdkKey.environment_id,
        name: existingSdkKey.name,
        keyHash: existingSdkKey.key_hash,
      },
    };
  }

  upsertSdkKeys(sdkKeys: SdkKeyReplica[]) {
    return this.transaction(() => {
      return sdkKeys.map(sdkKey => this.upsertSdkKeyUnsafe(sdkKey));
    });
  }

  private upsertSdkKeyUnsafe(sdkKey: SdkKeyReplica): 'created' | 'updated' | 'ignored' {
    const existingSdkKey = this.getSdkKeyByIdStmt.get({id: sdkKey.id});
    if (existingSdkKey && isDeepEqual(existingSdkKey, sdkKey)) {
      return 'ignored';
    }

    if (existingSdkKey) {
      // delete existing sdk key
      this.deleteSdkKeyStmt.run({id: sdkKey.id});
    }

    // insert new sdk key
    this.insertSdkKeyStmt.run({
      id: sdkKey.id,
      projectId: sdkKey.projectId,
      environmentId: sdkKey.environmentId,
      name: sdkKey.name,
      keyHash: sdkKey.keyHash,
    });

    return existingSdkKey ? 'updated' : 'created';
  }

  getProjectConfigs(params: {projectId: string; environmentId: string}) {
    const configs = this.getProjectConfigsStmt.all(params);

    return configs.map(config => ({
      name: config.name,
      version: config.version,
      environmentId: params.environmentId,
      value: JSON.parse(config.value) as ConfigValue,
      overrides: JSON.parse(config.overrides) as Override[],
      projectId: config.projectId,
    }));
  }

  getConfigById(id: string) {
    const config = this.getConfigByIdStmt.get({configId: id});
    if (!config) {
      return undefined;
    }

    return {
      id: config.id,
      projectId: config.project_id,
      name: config.name,
      version: config.version,
      value: JSON.parse(config.value) as ConfigValue,
      overrides: JSON.parse(config.overrides) as Override[],
    };
  }

  getConfigReplicaById(configId: string): ConfigReplica | undefined {
    const config = this.getConfigByIdStmt.get({configId});
    if (!config) {
      return undefined;
    }

    const variants = this.getConfigVariantsByConfigIdStmt.all({configId});

    return {
      id: config.id,
      projectId: config.project_id,
      name: config.name,
      version: config.version,
      value: JSON.parse(config.value) as ConfigValue,
      overrides: JSON.parse(config.overrides) as Override[],
      variants: variants.map(variant => ({
        id: variant.id,
        configId: configId,
        environmentId: variant.environmentId,
        value: JSON.parse(variant.value) as ConfigValue,
        overrides: JSON.parse(variant.overrides) as Override[],
      })),
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

    return {
      name: config.name,
      version: config.version,
      environmentId: params.environmentId,
      value: JSON.parse(config.value) as ConfigValue,
      overrides: JSON.parse(config.overrides) as Override[],
      projectId: config.project_id,
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

    return JSON.parse(config.value) as ConfigValue;
  }

  deleteConfig(id: string) {
    return this.transaction(() => {
      return this.deleteConfigUnsafe(id);
    });
  }

  private deleteConfigUnsafe(
    id: string,
  ): {type: 'ignored'} | {type: 'deleted'; entity: ConfigReplica} {
    const existingConfig = this.getConfigById(id);
    if (!existingConfig) {
      return {type: 'ignored'};
    }

    const configVariants = this.getConfigVariantsByConfigIdStmt.all({configId: id});

    this.deleteConfigStmt.run({id});
    return {
      type: 'deleted',
      entity: {
        id: existingConfig.id,
        projectId: existingConfig.projectId,
        name: existingConfig.name,
        value: existingConfig.value,
        overrides: existingConfig.overrides,
        version: existingConfig.version,
        variants: configVariants
          .filter(v => v.environmentId !== null)
          .map(v => ({
            id: v.id,
            configId: existingConfig.id,
            environmentId: v.environmentId,
            value: JSON.parse(v.value) as ConfigValue,
            overrides: JSON.parse(v.overrides) as Override[],
          })),
      },
    };
  }

  getConfigsConsumerId() {
    return this.getKv(CONFIGS_CONSUMER_ID_KEY);
  }

  insertConfigsConsumerId(consumerId: string) {
    this.insertKv(CONFIGS_CONSUMER_ID_KEY, consumerId);
  }

  getSdkKeysConsumerId() {
    return this.getKv(SDK_KEYS_CONSUMER_ID_KEY);
  }

  insertSdkKeysConsumerId(consumerId: string) {
    this.insertKv(SDK_KEYS_CONSUMER_ID_KEY, consumerId);
  }

  private insertKv(key: string, value: string) {
    this.insertKvStmt.run({key, value});
  }

  private getKv(key: string) {
    return this.getKvStmt.get({key})?.value;
  }

  clearConfigs() {
    this.transaction(() => {
      this.clearConfigsUnsafe();
    });
  }

  private clearConfigsUnsafe() {
    this.clearConfigsStmt.run({});
    this.clearConfigVariantsStmt.run({});
    this.deleteKvStmt.run({key: CONFIGS_CONSUMER_ID_KEY});
  }

  clearSdkKeys() {
    this.transaction(() => {
      this.clearSdkKeysUnsafe();
    });
  }

  clear() {
    this.transaction(() => {
      this.clearConfigsUnsafe();
      this.clearSdkKeysUnsafe();
    });
  }

  private clearSdkKeysUnsafe() {
    this.clearSdkKeysStmt.run({});
    this.deleteKvStmt.run({key: SDK_KEYS_CONSUMER_ID_KEY});
  }

  getConfigReferences(params: {projectId: string; configName: string}): ConfigReferenceReplica[] {
    const references = this.getConfigReferencesStmt.all(params);
    return references.map(reference => ({
      configId: reference.config_id,
      referenceProjectId: reference.reference_project_id,
      referenceConfigName: reference.reference_config_name,
    }));
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
      value: JSON.stringify(config.value),
      overrides: JSON.stringify(config.overrides),
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

    const references = uniqueBy(
      config.overrides
        .flatMap(override => extractOverrideReferences(override))
        .concat(
          config.variants.flatMap(variant =>
            variant.overrides.flatMap(override => extractOverrideReferences(override)),
          ),
        ),
      reference => `${reference.projectId}-${reference.configName}`,
    );

    for (const reference of references) {
      this.insertConfigReferenceStmt.run({
        id: uuidV4(),
        configId: config.id,
        referenceProjectId: reference.projectId,
        referenceConfigName: reference.configName,
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
