import type {Pool} from 'pg';
import {AsyncWorker} from './async-worker';
import type {ConfigChangePayload, ConfigStore} from './config-store';
import {CONFIGS_REPLICA_PULL_INTERVAL_MS} from './constants';
import {GLOBAL_CONTEXT} from './context';
import type {EventBusClient} from './event-bus';
import type {Logger} from './logger';
import {type PgEventBusClientNotificationHandler} from './pg-event-bus-client';
import type {Service} from './service';
import {Subject} from './subject';
import {Timer} from './timer';
import type {Brand} from './utils';

type ConfigKey = Brand<string, 'ConfigKey'>;

function toConfigKey(projectId: string, name: string): ConfigKey {
  return `${projectId}::${name}` as ConfigKey;
}

interface ConfigReplica {
  id: string;
  name: string;
  projectId: string;
  value: unknown;
  version: number;
}

export type ConfigReplicaEvent =
  | {
      type: 'created';
      config: ConfigReplica;
    }
  | {
      type: 'updated';
      config: ConfigReplica;
    }
  | {
      type: 'deleted';
      config: ConfigReplica;
    };

export interface ConfigsReplicaOptions {
  pool?: Pool; // optional when a custom listener is supplied (e.g., in-memory)
  configs: ConfigStore;
  logger: Logger;
  /** Optional factory to create a custom listener for notifications (used in tests). */
  createEventBusClient: (
    onNotification: PgEventBusClientNotificationHandler<ConfigChangePayload>,
  ) => EventBusClient<ConfigChangePayload>;
  /** Optional subject to publish config change events. */
  eventsSubject?: Subject<ConfigReplicaEvent>;
}

export class ConfigsReplica implements Service {
  private configsByKey: Map<ConfigKey, ConfigReplica> = new Map();
  private configsById: Map<string, ConfigReplica> = new Map();

  private worker: AsyncWorker;
  private eventBusClient: EventBusClient<ConfigChangePayload>;
  private timer: Timer;

  readonly name = 'ConfigsReplica';

  private changesConfigIds: string[] = [];
  private fullRefreshRequested = false;

  constructor(private readonly options: ConfigsReplicaOptions) {
    this.worker = new AsyncWorker({
      name: 'ConfigsReplicaWorker',
      task: async () => {
        await this.processEvents();
      },
      onError: error => {
        options.logger.error(GLOBAL_CONTEXT, {msg: 'ConfigsReplica worker error', error});
      },
    });

    const onNotification: PgEventBusClientNotificationHandler<ConfigChangePayload> = async msg => {
      const {configId} = msg;
      if (configId) {
        this.changesConfigIds.push(configId);
        this.worker.wakeup();
      }
    };

    this.eventBusClient = options.createEventBusClient(onNotification);

    this.timer = new Timer({
      intervalMs: CONFIGS_REPLICA_PULL_INTERVAL_MS,
      task: async () => {
        this.fullRefreshRequested = true;
        this.worker.wakeup();
      },
      onError: error => {
        options.logger.error(GLOBAL_CONTEXT, {msg: 'ConfigsReplica timer error', error});
      },
    });
  }

  getConfigValue<T>(params: {projectId: string; name: string}): T | undefined {
    const config = this.configsByKey.get(toConfigKey(params.projectId, params.name));
    return config?.value as T | undefined;
  }

  async start(): Promise<void> {
    await this.eventBusClient.start();
    await this.timer.start();

    this.fullRefreshRequested = true;
    await this.worker.start();
  }

  async stop(): Promise<void> {
    await this.eventBusClient.stop();
    await this.timer.stop();
    await this.worker.stop();
  }

  private async processEvents() {
    if (this.fullRefreshRequested) {
      this.fullRefreshRequested = false;
      this.changesConfigIds = [];
      await this.refreshAllConfigs();
      return;
    }

    if (this.changesConfigIds.length > 0) {
      const configId = this.changesConfigIds.shift()!;
      const config = await this.options.configs.getReplicaConfig(configId);
      if (config) {
        const existingConfig = this.configsById.get(configId);
        const eventType =
          existingConfig !== undefined
            ? existingConfig.version !== config.version
              ? 'updated'
              : 'spurious_notify'
            : 'created';

        const configReplica: ConfigReplica = {
          id: configId,
          ...config,
        };

        this.configsByKey.set(toConfigKey(config.projectId, config.name), configReplica);
        this.configsById.set(configId, configReplica);

        this.options.logger.info(GLOBAL_CONTEXT, {
          msg: `ConfigsReplica eventType config ${config.name} (projectId=${config.projectId})`,
        });

        // Publish event
        if (eventType !== 'spurious_notify') {
          this.options.eventsSubject?.next({
            type: eventType,
            config: configReplica,
          });
        }
      } else {
        const existing = this.configsById.get(configId);
        if (existing) {
          this.configsById.delete(configId);
          this.configsByKey.delete(toConfigKey(existing.projectId, existing.name));
          this.options.logger.info(GLOBAL_CONTEXT, {
            msg: `ConfigsReplica deleted config ${existing.name} (projectId=${existing.projectId})`,
          });

          // Publish delete event
          if (this.options.eventsSubject) {
            this.options.eventsSubject.next({
              type: 'deleted',
              config: existing,
            });
          }
        }
      }
    }

    if (this.changesConfigIds.length > 0 || this.fullRefreshRequested) {
      this.worker.wakeup();
    }
  }

  private async refreshAllConfigs() {
    const configs = await this.options.configs.getReplicaDump();

    // Track changes if eventsSubject is provided
    if (this.options.eventsSubject) {
      const oldConfigsById = new Map(this.configsById);
      const newConfigsById = new Map(configs.map(c => [c.id, c]));

      // Detect deleted configs
      for (const [id, oldConfig] of oldConfigsById) {
        if (!newConfigsById.has(id)) {
          this.options.eventsSubject.next({
            type: 'deleted',
            config: oldConfig,
          });
        }
      }

      // Detect created and updated configs
      for (const newConfig of configs) {
        const oldConfig = oldConfigsById.get(newConfig.id);
        if (!oldConfig) {
          // New config created
          this.options.eventsSubject.next({
            type: 'created',
            config: newConfig,
          });
        } else if (oldConfig.version !== newConfig.version) {
          // Config updated (version changed)
          this.options.eventsSubject.next({
            type: 'updated',
            config: newConfig,
          });
        }
      }
    }

    this.configsByKey = new Map(configs.map(c => [toConfigKey(c.projectId, c.name), c]));
    this.configsById = new Map(configs.map(c => [c.id, c]));

    this.options.logger.info(GLOBAL_CONTEXT, {
      msg: `ConfigsReplica refreshed ${configs.length} configs`,
    });
  }
}
