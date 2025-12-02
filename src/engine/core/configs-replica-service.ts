import type {Pool} from 'pg';
import {AsyncWorker} from './async-worker';
import {ConfigsReplicaStore, type ConfigVariantReplica} from './configs-replica-store';
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
import type {ConfigStore} from './stores/config-store';
import type {ConfigVariantChangePayload} from './stores/config-variant-store';
import {Subject} from './subject';
import {Timer} from './timer';

export type ConfigReplicaEvent =
  | {
      type: 'created';
      variant: ConfigVariantReplica;
    }
  | {
      type: 'updated';
      variant: ConfigVariantReplica;
    }
  | {
      type: 'deleted';
      variant: ConfigVariantReplica;
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

  private changesVariantIds: string[] = [];
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
      if (msg?.variantId) {
        this.changesVariantIds.push(msg.variantId);
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

  getEnvironmentConfigs(params: {
    projectId: string;
    environmentId: string;
  }): ConfigVariantReplica[] {
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
  }): ConfigVariantReplica | undefined {
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
      this.changesVariantIds = [];
      await this.refreshAllConfigVariants();
      return;
    }

    if (this.changesVariantIds.length > 0) {
      const variantId = this.changesVariantIds.shift()!;
      // When a config changes, we need to refresh all its variants across all environments
      // Get all variants for this config
      const variant = await this.options.configs.getReplicaConfig(variantId);

      if (variant) {
        const existingVariant = this.store.getById(variantId);
        const eventType =
          existingVariant !== undefined
            ? existingVariant.version !== variant.version
              ? 'updated'
              : 'spurious_notify'
            : 'created';

        const configVariantReplica: ConfigVariantReplica = {
          variantId,
          name: variant.name,
          projectId: variant.projectId,
          environmentId: variant.environmentId,
          value: variant.value,
          renderedOverrides: await renderOverrides(
            variant.overrides,
            async ({projectId, configName}) => {
              // For override references, use the same environment as the current variant
              return this.getConfigValue({
                projectId,
                name: configName,
                environmentId: variant.environmentId,
              });
            },
          ),
          version: variant.version,
        };

        this.store.upsert(configVariantReplica);

        this.options.logger.info(GLOBAL_CONTEXT, {
          msg: `ConfigsReplica ${eventType} config ${variant.name} (env=${variant.environmentId}, projectId=${variant.projectId})`,
        });

        // Publish event
        if (eventType !== 'spurious_notify') {
          this.options.eventsSubject?.next({
            type: eventType,
            variant: configVariantReplica,
          });
        }
      } else {
        const existing = this.store.getById(variantId);
        if (existing) {
          this.store.delete(variantId);
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
      }
    }

    if (this.changesVariantIds.length > 0 || this.fullRefreshRequested) {
      this.worker.wakeup();
    }
  }

  private async refreshAllConfigVariants() {
    const rawVariants = await this.options.configs.getReplicaDump();
    const rawVariantsByKey = new Map(
      rawVariants.map(variant => [
        {
          projectId: variant.projectId,
          name: variant.name,
          environmentId: variant.environmentId,
        },
        variant,
      ]),
    );

    const variants: ConfigVariantReplica[] = [];
    for (const rawVariant of rawVariants) {
      variants.push({
        ...rawVariant,
        variantId: rawVariant.variant_id,
        renderedOverrides: await renderOverrides(
          rawVariant.overrides,
          async ({projectId, configName}) => {
            // For override references, use the same environment as the current config
            return rawVariantsByKey.get({
              projectId,
              name: configName,
              environmentId: rawVariant.environmentId,
            })?.value;
          },
        ),
      });
    }

    // Track changes if eventsSubject is provided
    if (this.options.eventsSubject) {
      const oldVariantsById = this.store.getAllVariantsById();
      const newVariantsById = new Map(variants.map(c => [c.variantId, c]));

      // Detect deleted configs
      for (const [id, oldVariant] of oldVariantsById) {
        if (!newVariantsById.has(id)) {
          this.options.eventsSubject.next({
            type: 'deleted',
            variant: oldVariant,
          });
        }
      }

      // Detect created and updated configs
      for (const newVariant of variants) {
        const oldVariant = oldVariantsById.get(newVariant.variantId);
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
