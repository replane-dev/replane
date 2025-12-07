import type {Kysely} from 'kysely';
import {
  REPLICA_CONFIGS_DUMP_BATCH_SIZE,
  REPLICA_STEP_EVENTS_COUNT,
  REPLICA_STEP_INTERVAL_MS,
} from './constants';
import {GLOBAL_CONTEXT, type Context} from './context';
import type {DB} from './db';
import {ConsumerDestroyedError, type EventHub, type EventHubConsumer} from './event-hub';
import type {Logger} from './logger';
import type {Override, RenderedOverride} from './override-condition-schemas';
import {renderOverrides} from './override-evaluator';
import type {ReplicaEventBus} from './replica-event-bus';
import type {Service} from './service';
import {ReplicaStore, type ConfigReplica, type ConfigVariantReplica} from './stores/replica-store';
import {assertNever, chunkArray, groupBy, wait} from './utils';

export type ReplicaEvent =
  | {
      type: 'config_created';
      config: ConfigReplica;
    }
  | {
      type: 'config_updated';
      config: ConfigReplica;
    }
  | {
      type: 'config_deleted';
      config: {
        configId: string;
        projectId: string;
        name: string;
        version: number;
      };
    };

export interface ConfigChangeEvent {
  configId: string;
}

export interface RenderedConfig {
  projectId: string;
  name: string;
  version: number;
  environmentId: string;
  value: unknown;
  overrides: RenderedOverride[];
}

export class Replica {
  static async create(
    db: Kysely<DB>,
    replicaStore: ReplicaStore,

    hub: EventHub<ConfigChangeEvent>,
    logger: Logger,
    onFatalError: (error: unknown) => void,
    replicaEvents: ReplicaEventBus,
  ): Promise<Replica> {
    const replica = await Replica.createLagging(db, replicaStore, hub, logger, replicaEvents);

    // now we need to catch up with the latest events
    while (true) {
      const {status} = await replica.step();
      if (status === 'up-to-date') {
        break;
      }
    }

    void replica.loop().catch(onFatalError);

    return replica;
  }

  private static async createLagging(
    db: Kysely<DB>,
    replicaStore: ReplicaStore,
    hub: EventHub<ConfigChangeEvent>,
    logger: Logger,
    replicaEvents: ReplicaEventBus,
  ): Promise<Replica> {
    const consumerId = replicaStore.getConsumerId();

    // restore existing consumer
    if (consumerId) {
      const consumer = await hub.tryRestoreConsumer(consumerId);
      if (consumer) {
        return new Replica(db, replicaStore, logger, consumer, replicaEvents);
      } else {
        // consumer is not alive, we need to clear the storage and start over
        replicaStore.clear();
      }
    }

    // we need to initialize a new consumer before dumping existing configs
    const consumer = await hub.createConsumer();
    replicaStore.insertConsumerId(consumer.consumerId);

    // dump configs to the replica store
    for await (const configs of dumpConfigs({db})) {
      replicaStore.upsertConfigs(configs);
    }

    const replica = new Replica(db, replicaStore, logger, consumer, replicaEvents);

    return replica;
  }

  private isStopped = false;

  private constructor(
    private readonly db: Kysely<DB>,
    private readonly replicaStore: ReplicaStore,
    private readonly logger: Logger,
    private readonly hub: EventHubConsumer<ConfigChangeEvent>,
    private readonly replicaEvents: ReplicaEventBus,
  ) {
    // Replica.create stats the loop
  }

  getConfigValue(params: {
    projectId: string;
    configName: string;
    environmentId: string;
  }): unknown | undefined {
    return this.replicaStore.getConfigValue(params);
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
          configResolver: params => this.getConfigValue(params),
          environmentId: params.environmentId,
        }),
        value: config.value,
        projectId: config.projectId,
      });
    }

    return result;
  }

  async getConfig(params: {
    projectId: string;
    configName: string;
    environmentId: string;
  }): Promise<RenderedConfig | undefined> {
    const config = this.replicaStore.getEnvironmentalConfig({
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
      value: config.value,
      overrides: await renderOverrides({
        overrides: config.overrides,
        configResolver: params => this.getConfigValue(params),
        environmentId: params.environmentId,
      }),
      projectId: config.projectId,
    };
  }

  private async loop() {
    while (!this.isStopped) {
      let status: 'lagging' | 'up-to-date' | 'unknown' = 'unknown';
      try {
        status = await this.step().then(s => s.status);
      } catch (error) {
        this.logger.error(GLOBAL_CONTEXT, {msg: 'Replica step error', error});

        if (error instanceof ConsumerDestroyedError) {
          this.isStopped = true;
          throw error;
        }
      }

      if (status !== 'lagging') {
        await wait(REPLICA_STEP_INTERVAL_MS);
      }
    }
  }

  private async step(): Promise<{status: 'lagging' | 'up-to-date'}> {
    const events = await this.hub.pullEvents(REPLICA_STEP_EVENTS_COUNT);

    await this.processEvents(events);

    await this.hub.ackEvents(events.map(e => e.id));

    return {status: events.length === REPLICA_STEP_EVENTS_COUNT ? 'lagging' : 'up-to-date'};
  }

  private async processEvents(events: {id: string; data: ConfigChangeEvent}[]) {
    const configs = await getReplicaConfigs({
      db: this.db,
      configIds: events.map(e => e.data.configId),
    });

    const upsertResults = this.replicaStore.upsertConfigs(configs);
    for (let i = 0; i < upsertResults.length; i += 1) {
      const result = upsertResults[i];

      if (result === 'created') {
        this.replicaEvents.next(configs[i].projectId, {type: 'config_created', config: configs[i]});
      } else if (result === 'updated') {
        this.replicaEvents.next(configs[i].projectId, {type: 'config_updated', config: configs[i]});
      } else if (result === 'ignored') {
        // do nothing
      } else {
        assertNever(result, 'Unknown upsert result');
      }
    }

    const configsById = new Map<string, ConfigReplica>(configs.map(c => [c.id, c]));

    for (const event of events) {
      const config = configsById.get(event.data.configId);
      if (config) continue; // already upserted

      const toBeDeleted = this.replicaStore.getConfigById(event.data.configId);
      if (!toBeDeleted) continue; // already deleted

      this.replicaEvents.next(toBeDeleted.projectId, {
        type: 'config_deleted',
        config: {
          configId: toBeDeleted.id,
          projectId: toBeDeleted.projectId,
          name: toBeDeleted.name,
          version: toBeDeleted.version,
        },
      });
      this.replicaStore.deleteConfig(toBeDeleted.id);
    }
  }

  stop() {
    this.isStopped = true;
  }

  async destroy() {
    this.stop();
    await this.hub.destroy();
    this.replicaStore.clear();
    this.replicaEvents.complete();
  }
}

async function* dumpConfigs(params: {db: Kysely<DB>}): AsyncGenerator<ConfigReplica[]> {
  const configIds = await params.db.selectFrom('configs').select('id').execute();

  for (const batch of chunkArray(configIds, REPLICA_CONFIGS_DUMP_BATCH_SIZE)) {
    yield await getReplicaConfigs({db: params.db, configIds: batch.map(c => c.id)});
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
      value: variant.value,
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
    private readonly hub: EventHub<ConfigChangeEvent>,
    private readonly logger: Logger,
    private readonly onFatalError: (error: unknown) => void,
    private readonly replicaEvents: ReplicaEventBus,
  ) {}

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

  async getConfigValue(params: {
    projectId: string;
    configName: string;
    environmentId: string;
  }): Promise<unknown | undefined> {
    if (!this.replica) {
      throw new Error('Replica not started');
    }
    return this.replica.getConfigValue(params);
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
