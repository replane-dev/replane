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
} from './stores/replica-store';
import {MappedTopic} from './topic';
import {groupBy} from './utils';
import type {ConfigValue} from './zod';

export type ReplicaEvent = ReplicatorEvent<ConfigReplica>;

export interface ConfigChangeEvent {
  configId: string;
}

export interface AppHubEvents {
  configs: ConfigChangeEvent;
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
    const replicatorSource: ReplicatorSource<ConfigReplica> = {
      getByIds: async (ids: string[]) => {
        return await getReplicaConfigs({db, configIds: ids});
      },
      getIds: async () => {
        return (await db.selectFrom('configs').select('id').execute()).map(c => c.id);
      },
    };
    const replicatorTarget: ReplicatorTarget<ConfigReplica> = {
      getReplicatorConsumerId: async () => replicaStore.getConsumerId(),
      insertReplicatorConsumerId: async (consumerId: string) =>
        replicaStore.insertConsumerId(consumerId),
      upsert: async (entities: ConfigReplica[]) => {
        return replicaStore.upsertConfigs(entities);
      },
      delete: async (id: string) => {
        return replicaStore.deleteConfig(id);
      },
      clear: async () => replicaStore.clear(),
    };

    const configsReplicator = await Replicator.create<ConfigReplica, ConfigReplica>(
      replicatorSource,
      replicatorTarget,
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

    return new Replica(replicaStore, configsReplicator);
  }

  private isStopped = false;

  private constructor(
    private readonly replicaStore: ReplicaStore,
    private readonly configsReplicator: Replicator<ConfigReplica, ConfigReplica>,
  ) {}

  async sync() {
    await this.configsReplicator.sync();
  }

  private getConfigValueWithoutOverrides(params: {
    projectId: string;
    configName: string;
    environmentId: string;
  }): ConfigValue | undefined {
    return this.replicaStore.getConfigValue(params);
  }

  public async getConfig(params: {
    projectId: string;
    configName: string;
    environmentId: string;
  }): Promise<RenderedConfig | undefined> {
    const config = this.replicaStore.getEnvironmentalConfig(params);
    if (!config) {
      return undefined;
    }
    return await this.renderConfig(config);
  }

  private async renderConfig(config: EnvironmentalConfigReplica): Promise<RenderedConfig> {
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
  }

  async destroy() {
    this.stop();
    await this.configsReplicator.destroy();
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
    .innerJoin('config_variants as cv', 'cv.config_id', 'c.id')
    .select([
      'c.id as config_id',
      'c.name',
      'c.project_id',
      'c.version',
      'cv.id as variant_id',
      'cv.environment_id',
      'cv.value',
      'cv.overrides',
    ])
    .where('c.id', 'in', params.configIds);

  const configs = await query.execute();

  return groupBy(configs, config => ({
    configId: config.config_id,
    projectId: config.project_id,
    name: config.name,
    version: config.version,
  })).map(([config, value]): ConfigReplica => {
    const variants: ConfigVariantReplica[] = value.map(variant => ({
      id: variant.variant_id,
      configId: variant.config_id,
      environmentId: variant.environment_id,
      value: JSON.parse(variant.value) as ConfigValue,
      overrides: JSON.parse(variant.overrides) as Override[],
    }));
    return {
      id: config.configId,
      projectId: config.projectId,
      name: config.name,
      version: config.version,
      variants: variants.filter(variant => variant.environmentId !== null),
      defaultVariant: variants.find(variant => variant.environmentId === null) ?? null,
    };
  });
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

  async getConfig(params: {
    projectId: string;
    configName: string;
    environmentId: string;
  }): Promise<RenderedConfig | undefined> {
    if (!this.replica) {
      throw new Error('Replica not started');
    }

    return this.replica.getConfig(params);
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
