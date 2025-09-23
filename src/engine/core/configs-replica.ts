import type {Pool} from 'pg';
import {AsyncWorker} from './async-worker';
import type {ConfigChangePayload, ConfigStore} from './config-store';
import {CONFIGS_CHANGES_CHANNEL, CONFIGS_REPLICA_PULL_INTERVAL_MS} from './constants';
import {GLOBAL_CONTEXT} from './context';
import type {Listener} from './listener';
import type {Logger} from './logger';
import {type NotificationHandler} from './pg-listener';
import type {Service} from './service';
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

export interface ConfigsReplicaOptions {
  pool?: Pool; // optional when a custom listener is supplied (e.g., in-memory)
  configs: ConfigStore;
  logger: Logger;
  /** Optional factory to create a custom listener for notifications (used in tests). */
  createListener: (
    onNotification: NotificationHandler<ConfigChangePayload>,
  ) => Listener<ConfigChangePayload>;
}

export class ConfigsReplica implements Service {
  private configsByKey: Map<ConfigKey, ConfigReplica> = new Map();
  private configsById: Map<string, ConfigReplica> = new Map();

  private worker: AsyncWorker;
  private listener: Listener<ConfigChangePayload>;
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

    const onNotification: NotificationHandler<ConfigChangePayload> = async msg => {
      if (msg.channel === CONFIGS_CHANGES_CHANNEL) {
        const {configId} = msg.payload;
        if (configId) {
          console.log('[dbg] received config change notification', {configId});
          this.changesConfigIds.push(configId);
          this.worker.wakeup();
        }
      }
    };

    this.listener = options.createListener(onNotification);

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
    await this.listener.start();
    await this.timer.start();

    this.fullRefreshRequested = true;
    await this.worker.start();
  }

  async stop(): Promise<void> {
    await this.listener.stop();
    await this.timer.stop();
    await this.worker.stop();
  }

  private async processEvents() {
    console.log('[dbg] processEvents', {changesConfigIds: this.changesConfigIds});
    if (this.fullRefreshRequested) {
      console.log('[dbg] doing full refresh of configs');
      this.fullRefreshRequested = false;
      this.changesConfigIds = [];
      await this.refreshAllConfigs();
      return;
    }

    if (this.changesConfigIds.length > 0) {
      const configId = this.changesConfigIds.shift()!;
      console.log('[dbg] processing config change', {configId});
      const config = await this.options.configs.getReplicaConfig(configId);
      if (config) {
        console.log('[dbg] received config', config);
        this.configsByKey.set(toConfigKey(config.projectId, config.name), {
          id: configId,
          ...config,
        });
        this.configsById.set(configId, {id: configId, ...config});
        this.options.logger.info(GLOBAL_CONTEXT, {
          msg: `ConfigsReplica updated config ${config.name} (projectId=${config.projectId})`,
        });
      } else {
        const existing = this.configsById.get(configId);
        if (existing) {
          this.configsById.delete(configId);
          this.configsByKey.delete(toConfigKey(existing.projectId, existing.name));
          this.options.logger.info(GLOBAL_CONTEXT, {
            msg: `ConfigsReplica deleted config ${existing.name} (projectId=${existing.projectId})`,
          });
        }
      }
    }

    if (this.changesConfigIds.length > 0 || this.fullRefreshRequested) {
      this.worker.wakeup();
    }
  }

  private async refreshAllConfigs() {
    const configs = await this.options.configs.getReplicaDump();

    this.configsByKey = new Map(configs.map(c => [toConfigKey(c.projectId, c.name), c]));
    this.configsById = new Map(configs.map(c => [c.id, c]));

    this.options.logger.info(GLOBAL_CONTEXT, {
      msg: `ConfigsReplica refreshed ${configs.length} configs`,
    });
  }
}
