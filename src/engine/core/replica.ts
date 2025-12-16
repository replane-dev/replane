import assert from 'assert';
import type {Kysely} from 'kysely';
import {type Context} from './context';
import type {DB} from './db';
import {type EventHub} from './event-hub';
import type {Logger} from './logger';
import type {Observer} from './observable';
import type {Override, RenderedOverride} from './override-condition-schemas';
import {renderOverrides} from './override-evaluator';
import {
  Replicator,
  type EntityChangeEvent,
  type ReplicatorEvent,
  type ReplicatorSource,
  type ReplicatorTarget,
} from './replicator';
import type {Service} from './service';
import {
  ReplicaStore,
  type ConfigReplica,
  type ConfigVariantReplica,
  type EnvironmentalConfigReplica,
  type SdkKeyReplica,
} from './stores/replica-store';
import {Subject} from './subject';
import {MappedTopic} from './topic';
import {groupBy} from './utils';
import type {ConfigValue} from './zod';

export type ReplicaEvent = ReplicatorEvent<ConfigReplica>;

export interface ConfigChangeEvent {
  configId: string;
}

export interface SdkKeyChangeEvent {
  sdkKeyId: string;
}

export interface AppHubEvents {
  configs: ConfigChangeEvent;
  sdkKeys: SdkKeyChangeEvent;
}

export interface RenderedConfig {
  projectId: string;
  name: string;
  version: number;
  environmentId: string;
  value: ConfigValue;
  overrides: RenderedOverride[];
}

export class Replica {
  static async create(
    db: Kysely<DB>,
    replicaStore: ReplicaStore,
    hub: EventHub<AppHubEvents>,
    logger: Logger,
    onFatalError: (error: unknown) => void,
    replicaEvents: Observer<ReplicaEvent>,
  ): Promise<Replica> {
    const configsReplicatorSource: ReplicatorSource<ConfigReplica> = {
      getByIds: async (ids: string[]) => {
        return await getReplicaConfigs({db, configIds: ids});
      },
      getIds: async () => {
        return (await db.selectFrom('configs').select('id').execute()).map(c => c.id);
      },
    };
    const configsReplicatorTarget: ReplicatorTarget<ConfigReplica> = {
      getReplicatorConsumerId: async () => replicaStore.getConfigsConsumerId(),
      insertReplicatorConsumerId: async (consumerId: string) =>
        replicaStore.insertConfigsConsumerId(consumerId),
      upsert: async (entities: ConfigReplica[]) => {
        return replicaStore.upsertConfigs(entities);
      },
      delete: async (id: string) => {
        return replicaStore.deleteConfig(id);
      },
      clear: async () => replicaStore.clearConfigs(),
    };

    const configsReplicator = await Replicator.create<ConfigReplica, ConfigReplica>(
      configsReplicatorSource,
      configsReplicatorTarget,
      (config: ConfigReplica) => config,
      (config: ConfigReplica) => config.id,
      new MappedTopic(
        hub.getTopic('configs'),
        (event: ConfigChangeEvent): EntityChangeEvent => ({
          entityId: event.configId,
        }),
      ),
      logger,
      onFatalError,
      replicaEvents,
    );

    const sdkKeysReplicatorSource: ReplicatorSource<SdkKeyReplica> = {
      getByIds: async (ids: string[]) => {
        return await getReplicaSdkKeys({db, sdkKeyIds: ids});
      },
      getIds: async () => {
        return (await db.selectFrom('sdk_keys').select('id').execute()).map(k => k.id);
      },
    };
    const sdkKeysReplicatorTarget: ReplicatorTarget<SdkKeyReplica> = {
      getReplicatorConsumerId: async () => replicaStore.getSdkKeysConsumerId(),
      insertReplicatorConsumerId: async (consumerId: string) =>
        replicaStore.insertSdkKeysConsumerId(consumerId),
      upsert: async (entities: SdkKeyReplica[]) => {
        return replicaStore.upsertSdkKeys(entities);
      },
      clear: async () => replicaStore.clearSdkKeys(),
      delete: async (id: string) => {
        return replicaStore.deleteSdkKey(id);
      },
    };
    const sdkKeysReplicator = await Replicator.create<SdkKeyReplica, SdkKeyReplica>(
      sdkKeysReplicatorSource,
      sdkKeysReplicatorTarget,
      (sdkKey: SdkKeyReplica) => sdkKey,
      (sdkKey: SdkKeyReplica) => sdkKey.id,
      new MappedTopic(
        hub.getTopic('sdkKeys'),
        (event: SdkKeyChangeEvent): EntityChangeEvent => ({
          entityId: event.sdkKeyId,
        }),
      ),
      logger,
      onFatalError,
      new Subject(),
    );

    return new Replica(replicaStore, configsReplicator, sdkKeysReplicator);
  }

  private constructor(
    private readonly replicaStore: ReplicaStore,
    private readonly configsReplicator: Replicator<ConfigReplica, ConfigReplica>,
    private readonly sdkKeysReplicator: Replicator<SdkKeyReplica, SdkKeyReplica>,
  ) {}

  async sync() {
    await Promise.all([this.configsReplicator.sync(), this.sdkKeysReplicator.sync()]);
  }

  private getConfigValueWithoutOverrides(params: {
    projectId: string;
    configName: string;
    environmentId: string;
  }): ConfigValue | undefined {
    return this.replicaStore.getConfigValue(params);
  }

  async renderConfig(config: EnvironmentalConfigReplica): Promise<RenderedConfig> {
    return {
      name: config.name,
      version: config.version,
      environmentId: config.environmentId,
      value: config.value,
      overrides: await renderOverrides({
        overrides: config.overrides,
        configResolver: async params => this.getConfigValueWithoutOverrides(params),
        environmentId: config.environmentId,
      }),
      projectId: config.projectId,
    };
  }

  async getSdkKey(keyId: string): Promise<SdkKeyReplica | undefined> {
    return this.replicaStore.getSdkKeyById(keyId);
  }

  async getProjectConfigs(params: {
    projectId: string;
    environmentId: string;
  }): Promise<RenderedConfig[]> {
    const configs = this.replicaStore.getProjectConfigs(params);

    const result: RenderedConfig[] = [];

    for (const config of configs) {
      result.push({
        name: config.name,
        version: config.version,
        environmentId: params.environmentId,
        overrides: await renderOverrides({
          overrides: config.overrides,
          configResolver: async params => this.getConfigValueWithoutOverrides(params),
          environmentId: params.environmentId,
        }),
        value: config.value,
        projectId: config.projectId,
      });
    }

    return result;
  }

  stop() {
    this.configsReplicator.stop();
    this.sdkKeysReplicator.stop();
  }

  async destroy() {
    this.stop();
    await this.configsReplicator.destroy();
    await this.sdkKeysReplicator.destroy();
    this.replicaStore.clear();
  }
}

async function getReplicaConfigs(params: {
  db: Kysely<DB>;
  configIds: string[];
}): Promise<ConfigReplica[]> {
  if (params.configIds.length === 0) {
    return [];
  }

  const query = params.db
    .selectFrom('configs as c')
    .leftJoin('config_variants as cv', 'cv.config_id', 'c.id')
    .select([
      'c.id as config_id',
      'c.name',
      'c.project_id',
      'c.version',
      'c.value',
      'c.overrides',
      'cv.id as variant_id',
      'cv.environment_id as variant_environment_id',
      'cv.value as variant_value',
      'cv.overrides as variant_overrides',
    ])
    .where('c.id', 'in', params.configIds);

  const configs = await query.execute();

  return groupBy(configs, config => config.config_id).map(([configId, value]): ConfigReplica => {
    const variants: ConfigVariantReplica[] = value
      .filter(x => x.variant_environment_id !== null)
      .map(variant => {
        // if for rows with environment_id !== null, the variant_id, config_id, environment_id, value, and overrides cannot be null
        assert(variant.variant_id !== null, 'Variant ID cannot be null');
        assert(variant.config_id !== null, 'Variant config ID cannot be null');
        assert(variant.variant_environment_id !== null, 'Variant environment ID cannot be null');
        assert(variant.variant_value !== null, 'Variant value cannot be null');
        assert(variant.variant_overrides !== null, 'Variant overrides cannot be null');

        return {
          id: variant.variant_id,
          configId: variant.config_id,
          environmentId: variant.variant_environment_id,
          value: JSON.parse(variant.variant_value) as ConfigValue,
          overrides: JSON.parse(variant.variant_overrides) as Override[],
        };
      });
    const firstVariant = value[0];
    return {
      id: configId,
      projectId: firstVariant.project_id,
      name: firstVariant.name,
      version: firstVariant.version,
      variants: variants,
      value: JSON.parse(firstVariant.value) as ConfigValue,
      overrides: JSON.parse(firstVariant.overrides) as Override[],
    };
  });
}

async function getReplicaSdkKeys(params: {
  db: Kysely<DB>;
  sdkKeyIds: string[];
}): Promise<SdkKeyReplica[]> {
  if (params.sdkKeyIds.length === 0) {
    return [];
  }

  const query = params.db
    .selectFrom('sdk_keys as sk')
    .select(['sk.id as sdk_key_id', 'sk.project_id', 'sk.name', 'sk.key_hash', 'sk.environment_id'])
    .where('sk.id', 'in', params.sdkKeyIds);

  const sdkKeys = await query.execute();

  return sdkKeys.map(sdkKey => ({
    id: sdkKey.sdk_key_id,
    projectId: sdkKey.project_id,
    name: sdkKey.name,
    keyHash: sdkKey.key_hash,
    environmentId: sdkKey.environment_id,
  }));
}

export class ReplicaService implements Service {
  readonly name = 'Replica';

  private replica: Replica | null = null;

  constructor(
    private readonly db: Kysely<DB>,
    private readonly replicaStore: ReplicaStore,
    private readonly hub: EventHub<AppHubEvents>,
    private readonly logger: Logger,
    private readonly onFatalError: (error: unknown) => void,
    private readonly replicaEvents: Observer<ReplicaEvent>,
  ) {}

  async sync() {
    if (!this.replica) {
      throw new Error('Replica not started');
    }
    await this.replica.sync();
  }

  async getSdkKeyById(keyId: string): Promise<SdkKeyReplica | undefined> {
    if (!this.replica) {
      throw new Error('Replica not started');
    }

    return this.replica.getSdkKey(keyId);
  }

  async getProjectConfigs(params: {
    projectId: string;
    environmentId: string;
  }): Promise<RenderedConfig[]> {
    if (!this.replica) {
      throw new Error('Replica not started');
    }

    return await this.replica.getProjectConfigs(params);
  }

  async renderConfig(config: EnvironmentalConfigReplica): Promise<RenderedConfig> {
    if (!this.replica) {
      throw new Error('Replica not started');
    }

    return await this.replica.renderConfig(config);
  }

  async start(ctx: Context) {
    const replica = await Replica.create(
      this.db,
      this.replicaStore,
      this.hub,
      this.logger,
      this.onFatalError,
      this.replicaEvents,
    );
    this.replica = replica;
  }

  async stop(ctx: Context) {
    this.replica?.stop();
  }
}
