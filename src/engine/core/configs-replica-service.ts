import type {Pool} from 'pg';
import {AsyncWorker} from './async-worker';
import {ConfigsReplicaStore, type ConfigReplica} from './configs-replica-store';
import {CONFIGS_REPLICA_PULL_INTERVAL_MS} from './constants';
import {GLOBAL_CONTEXT} from './context';
import type {EventBusClient} from './event-bus';
import type {Logger} from './logger';
import {
  evaluateConfigValue,
  renderOverrides,
  type EvaluationContext,
  type EvaluationResult,
} from './override-evaluator';
import {type PgEventBusClientNotificationHandler} from './pg-event-bus-client';
import type {Service} from './service';
import type {ConfigReplicaDump, ConfigStore} from './stores/config-store';
import type {ConfigVariantChangePayload} from './stores/config-variant-store';
import {Subject} from './subject';
import {Timer} from './timer';

export type ConfigReplicaEvent =
  | {
      type: 'created';
      variant: ConfigReplica;
    }
  | {
      type: 'updated';
      variant: ConfigReplica;
    }
  | {
      type: 'deleted';
      variant: ConfigReplica;
    };

export interface ConfigsReplicaOptions {
  pool?: Pool; // optional when a custom listener is supplied (e.g., in-memory)
  configs: ConfigStore;
  logger: Logger;
  /** Optional factory to create a custom listener for notifications (used in tests). */
  createEventBusClient: (
    onNotification: PgEventBusClientNotificationHandler<ConfigVariantChangePayload>,
  ) => EventBusClient<ConfigVariantChangePayload>;
  /** Optional subject to publish config change events. */
  eventsSubject?: Subject<ConfigReplicaEvent>;
}

export class ConfigsReplicaService implements Service {
  private store = new ConfigsReplicaStore();

  private worker: AsyncWorker;
  private eventBusClient: EventBusClient<ConfigVariantChangePayload>;
  private timer: Timer;

  readonly name = 'ConfigsReplica';

  private changesVariants: ConfigVariantChangePayload[] = [];
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

    const onNotification: PgEventBusClientNotificationHandler<
      ConfigVariantChangePayload
    > = async msg => {
      if (msg?.configId) {
        this.changesVariants.push(msg);
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

  getEnvironmentConfigs(params: {projectId: string; environmentId: string}): ConfigReplica[] {
    return this.store.getByEnvironment(params);
  }

  getConfigValue<T>(params: {
    projectId: string;
    name: string;
    environmentId: string;
    context?: EvaluationContext;
  }): T | undefined {
    const variant = this.store.getByVariantKey(params);
    if (!variant) {
      return undefined;
    }

    // Evaluate overrides if context is provided
    if (params.context) {
      const result: EvaluationResult = evaluateConfigValue(
        {value: variant.value, overrides: variant.renderedOverrides},
        params.context,
      );
      return result.finalValue as T;
    }

    // Return base value if no context
    return variant?.value as T | undefined;
  }

  getConfig(params: {
    projectId: string;
    name: string;
    environmentId: string;
  }): ConfigReplica | undefined {
    return this.store.getByVariantKey(params);
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
      this.changesVariants = [];
      await this.refreshAllConfigVariants();
      return;
    }

    if (this.changesVariants.length > 0) {
      const change = this.changesVariants.shift()!;
      // When a config changes, we need to refresh all its variants across all environments
      // Get all variants for this config
      const variants = await this.options.configs.getReplicaDump({configId: change.configId});

      if (variants.length > 0) {
        for (const variant of variants) {
          await this.processChangedVariant(variant);
        }
      } else {
        const existing = this.store.getByConfigId(change.configId);
        for (const variant of existing) {
          await this.processDeletedVariant(variant);
        }
      }
    }

    if (this.changesVariants.length > 0 || this.fullRefreshRequested) {
      this.worker.wakeup();
    }
  }

  private async processChangedVariant(variant: ConfigReplicaDump) {
    // Skip if this is the default variant (environmentId is null)
    // Default variants are materialized through getReplicaDump, not directly stored
    // TypeScript narrowing: environmentId is now guaranteed to be non-null
    const environmentId = variant.environmentId;

    const existingVariant = this.store.getByVariantKey({
      projectId: variant.projectId,
      name: variant.name,
      environmentId,
    });
    const eventType =
      existingVariant !== undefined
        ? existingVariant.version !== variant.version
          ? 'updated'
          : 'spurious_notify'
        : 'created';

    const configReplica: ConfigReplica = {
      configId: variant.configId,
      name: variant.name,
      projectId: variant.projectId,
      environmentId,
      value: variant.value,
      renderedOverrides: await renderOverrides(
        variant.overrides,
        async ({projectId, configName}) => {
          // For override references, use the same environment as the current variant
          return this.getConfigValue({
            projectId,
            name: configName,
            environmentId,
          });
        },
      ),
      version: variant.version,
    };

    this.store.upsert(configReplica);

    this.options.logger.info(GLOBAL_CONTEXT, {
      msg: `ConfigsReplica ${eventType} config ${variant.name} (env=${environmentId}, projectId=${variant.projectId})`,
    });

    // Publish event
    if (eventType !== 'spurious_notify') {
      this.options.eventsSubject?.next({
        type: eventType,
        variant: configReplica,
      });
    }
  }

  private async processDeletedVariant(existing: ConfigReplica) {
    this.store.delete({
      projectId: existing.projectId,
      name: existing.name,
      environmentId: existing.environmentId,
    });
    this.options.logger.info(GLOBAL_CONTEXT, {
      msg: `ConfigsReplica deleted config ${existing.name} (projectId=${existing.projectId}, environmentId=${existing.environmentId})`,
    });

    // Publish delete event
    if (this.options.eventsSubject) {
      this.options.eventsSubject.next({
        type: 'deleted',
        variant: existing,
      });
    }
  }

  private async refreshAllConfigVariants() {
    const rawVariants = await this.options.configs.getReplicaDump();
    const rawVariantsByKey = new Map(
      rawVariants.map(variant => [
        JSON.stringify({
          projectId: variant.projectId,
          name: variant.name,
          environmentId: variant.environmentId,
        }),
        variant,
      ]),
    );

    const variants: ConfigReplica[] = [];
    for (const rawVariant of rawVariants) {
      variants.push({
        configId: rawVariant.configId,
        name: rawVariant.name,
        projectId: rawVariant.projectId,
        environmentId: rawVariant.environmentId,
        value: rawVariant.value,
        renderedOverrides: await renderOverrides(
          rawVariant.overrides,
          async ({projectId, configName}) => {
            // For override references, use the same environment as the current config
            const key = JSON.stringify({
              projectId,
              name: configName,
              environmentId: rawVariant.environmentId,
            });
            return rawVariantsByKey.get(key)?.value;
          },
        ),
        version: rawVariant.version,
      });
    }

    // Track changes if eventsSubject is provided (compare by key now, not by ID)
    if (this.options.eventsSubject) {
      const oldVariantsByKey = new Map(
        variants.map(v => [
          JSON.stringify({
            projectId: v.projectId,
            name: v.name,
            environmentId: v.environmentId,
          }),
          this.store.getByVariantKey({
            projectId: v.projectId,
            name: v.name,
            environmentId: v.environmentId,
          }),
        ]),
      );

      // Simplified: just compare versions to detect updates
      for (const newVariant of variants) {
        const key = JSON.stringify({
          projectId: newVariant.projectId,
          name: newVariant.name,
          environmentId: newVariant.environmentId,
        });
        const oldVariant = oldVariantsByKey.get(key);
        if (!oldVariant) {
          // New config variant created
          this.options.eventsSubject.next({
            type: 'created',
            variant: newVariant,
          });
        } else if (oldVariant.version !== newVariant.version) {
          // Config variant updated (version changed)
          this.options.eventsSubject.next({
            type: 'updated',
            variant: newVariant,
          });
        }
      }
    }

    this.store = new ConfigsReplicaStore(variants);

    this.options.logger.info(GLOBAL_CONTEXT, {
      msg: `ConfigsReplica refreshed ${variants.length} configs`,
    });
  }
}
