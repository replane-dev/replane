import type {Pool} from 'pg';
import {AsyncWorker} from './async-worker';
import type {ConfigStore} from './config-store';
import type {ConfigVariantChangePayload} from './config-variant-store';
import {CONFIGS_REPLICA_PULL_INTERVAL_MS} from './constants';
import {GLOBAL_CONTEXT} from './context';
import type {EventBusClient} from './event-bus';
import type {Logger} from './logger';
import {
  evaluateConfigValue,
  renderOverrides,
  type EvaluationContext,
  type EvaluationResult,
  type RenderedOverride,
} from './override-evaluator';
import {type PgEventBusClientNotificationHandler} from './pg-event-bus-client';
import type {Service} from './service';
import {Subject} from './subject';
import {Timer} from './timer';
import type {Brand} from './utils';

type ConfigVariantKey = Brand<string, 'ConfigVariantKey'>;

function toConfigVariantKey(params: {
  projectId: string;
  name: string;
  environmentId: string;
}): ConfigVariantKey {
  return `${params.projectId}::${params.name}::${params.environmentId}` as ConfigVariantKey;
}

interface ConfigVariantReplica {
  variantId: string;
  name: string;
  projectId: string;
  environmentId: string;
  value: unknown;
  renderedOverrides: RenderedOverride[];
  version: number;
}

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

export class ConfigsReplica implements Service {
  private variantsByKey: Map<ConfigVariantKey, ConfigVariantReplica> = new Map();
  private variantsById: Map<string, ConfigVariantReplica> = new Map();

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

  getConfigValue<T>(params: {
    projectId: string;
    name: string;
    environmentId: string;
    context?: EvaluationContext;
  }): T | undefined {
    const variant = this.variantsByKey.get(toConfigVariantKey(params));
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
    return this.variantsByKey.get(toConfigVariantKey(params));
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
        const existingVariant = this.variantsById.get(variantId);
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

        this.variantsByKey.set(
          toConfigVariantKey({
            projectId: variant.projectId,
            name: variant.name,
            environmentId: variant.environmentId,
          }),
          configVariantReplica,
        );
        this.variantsById.set(variantId, configVariantReplica);

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
        const existing = this.variantsById.get(variantId);
        if (existing) {
          this.variantsById.delete(variantId);
          this.variantsByKey.delete(
            toConfigVariantKey({
              projectId: existing.projectId,
              name: existing.name,
              environmentId: existing.environmentId,
            }),
          );
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
        toConfigVariantKey({
          projectId: variant.projectId,
          name: variant.name,
          environmentId: variant.environmentId,
        }),
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
            return rawVariantsByKey.get(
              toConfigVariantKey({
                projectId,
                name: configName,
                environmentId: rawVariant.environmentId,
              }),
            )?.value;
          },
        ),
      });
    }

    // Track changes if eventsSubject is provided
    if (this.options.eventsSubject) {
      const oldVariantsById = new Map(this.variantsById);
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

    this.variantsByKey = new Map(
      variants.map(variant => [
        toConfigVariantKey({
          projectId: variant.projectId,
          name: variant.name,
          environmentId: variant.environmentId,
        }),
        variant,
      ]),
    );
    this.variantsById = new Map(variants.map(v => [v.variantId, v]));

    this.options.logger.info(GLOBAL_CONTEXT, {
      msg: `ConfigsReplica refreshed ${variants.length} configs`,
    });
  }
}
