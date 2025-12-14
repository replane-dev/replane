import {
  REPLICA_CONFIGS_DUMP_BATCH_SIZE as REPLICATOR_CONFIGS_DUMP_BATCH_SIZE,
  REPLICA_STEP_EVENTS_COUNT as REPLICATOR_STEP_EVENTS_COUNT,
  REPLICA_STEP_INTERVAL_MS as REPLICATOR_STEP_INTERVAL_MS,
} from './constants';
import {GLOBAL_CONTEXT, type Context} from './context';
import {ConsumerDestroyedError, EventHubTopic} from './event-hub';
import type {Logger} from './logger';
import type {Observer} from './observable';
import type {Service} from './service';
import type {Subject} from './subject';
import type {Topic, TopicConsumer} from './topic';
import {assertNever, chunkArray, wait} from './utils';

export type ReplicatorEvent<TTarget> =
  | {
      type: 'created';
      entity: TTarget;
    }
  | {
      type: 'updated';
      entity: TTarget;
    }
  | {
      type: 'deleted';
      entity: TTarget;
    };

export interface ReplicatorSource<T> {
  getByIds(ids: string[]): Promise<T[]>;
  getIds(): Promise<string[]>;
}

export interface ReplicatorTarget<T> {
  getReplicatorConsumerId(): Promise<string | undefined>;
  insertReplicatorConsumerId(consumerId: string): Promise<void>;
  upsert(entities: T[]): Promise<Array<'created' | 'updated' | 'ignored'>>;
  delete(id: string): Promise<{type: 'ignored'} | {type: 'deleted'; entity: T}>;
  clear(): Promise<void>;
}

export interface EntityChangeEvent {
  entityId: string;
}

export class Replicator<TSource, TTarget> {
  static async create<TSource, TTarget>(
    source: ReplicatorSource<TSource>,
    target: ReplicatorTarget<TTarget>,
    mapper: (source: TSource) => TTarget,
    idMapper: (source: TSource) => string,
    topic: Topic<EntityChangeEvent>,
    logger: Logger,
    onFatalError: (error: unknown) => void,
    replicaEvents: Observer<ReplicatorEvent<TTarget>>,
  ): Promise<Replicator<TSource, TTarget>> {
    const replicator = await Replicator.createLagging(
      source,
      target,
      mapper,
      idMapper,
      topic,
      logger,
      replicaEvents,
    );

    // now we need to catch up with the latest events
    await replicator.sync();

    replicator.loopPromise = replicator.loop().catch(onFatalError);

    return replicator;
  }

  private static async createLagging<TSource, TTarget>(
    source: ReplicatorSource<TSource>,
    target: ReplicatorTarget<TTarget>,
    mapper: (source: TSource) => TTarget,
    idMapper: (source: TSource) => string,
    topic: Topic<EntityChangeEvent>,
    logger: Logger,
    replicaEvents: Observer<ReplicatorEvent<TTarget>>,
  ): Promise<Replicator<TSource, TTarget>> {
    const consumerId = await target.getReplicatorConsumerId();

    // restore existing consumer
    if (consumerId) {
      const consumer = await topic.tryRestoreConsumer(consumerId);
      if (consumer) {
        return new Replicator<TSource, TTarget>(
          source,
          target,
          mapper,
          idMapper,
          logger,
          consumer,
          replicaEvents,
        );
      } else {
        // consumer is not alive, we need to clear the storage and start over
        await target.clear();
      }
    }

    // we need to initialize a new consumer before dumping existing configs
    const consumer = await topic.createConsumer();
    await target.insertReplicatorConsumerId(consumer.consumerId);

    // dump configs to the replica store
    for await (const entities of dump(source)) {
      target.upsert(entities.map(mapper));
    }

    const replicator = new Replicator<TSource, TTarget>(
      source,
      target,
      mapper,
      idMapper,
      logger,
      consumer,
      replicaEvents,
    );

    return replicator;
  }

  private _isStopped = false;

  private constructor(
    private readonly source: ReplicatorSource<TSource>,
    private readonly target: ReplicatorTarget<TTarget>,
    private readonly mapper: (source: TSource) => TTarget,
    private readonly idMapper: (source: TSource) => string,
    private readonly logger: Logger,
    private readonly consumer: TopicConsumer<EntityChangeEvent>,
    private readonly observer: Observer<ReplicatorEvent<TTarget>>,
  ) {
    // Replicator.create starts the loop
  }

  get isStopped() {
    return this._isStopped;
  }

  async sync() {
    while (true) {
      const {status} = await this.step();
      if (status === 'up-to-date') {
        break;
      }
    }
  }

  private loopPromise: Promise<void> | undefined;

  private async loop() {
    while (!this._isStopped) {
      let status: 'lagging' | 'up-to-date' | 'unknown' = 'unknown';
      try {
        status = await this.step().then(s => s.status);
      } catch (error) {
        this.logger.error(GLOBAL_CONTEXT, {msg: 'Replicator step error', error});

        if (error instanceof ConsumerDestroyedError) {
          this._isStopped = true;
          throw error;
        }
      }

      if (status !== 'lagging') {
        await wait(REPLICATOR_STEP_INTERVAL_MS);
      }
    }
  }

  private async step(): Promise<{status: 'lagging' | 'up-to-date'}> {
    const events = await this.consumer.pullEvents(REPLICATOR_STEP_EVENTS_COUNT);

    await this.processEvents(events);

    await this.consumer.ackEvents(events.map(e => e.id));

    return {status: events.length === REPLICATOR_STEP_EVENTS_COUNT ? 'lagging' : 'up-to-date'};
  }

  private async processEvents(events: {id: string; data: EntityChangeEvent}[]) {
    const entities = await this.source.getByIds(events.map(e => e.data.entityId));

    const upsertResults = await this.target.upsert(entities.map(this.mapper));
    for (let i = 0; i < upsertResults.length; i += 1) {
      const result = upsertResults[i];
      const entity = entities[i];

      if (result === 'created') {
        this.observer.next({type: 'created', entity: this.mapper(entity)});
      } else if (result === 'updated') {
        this.observer.next({type: 'updated', entity: this.mapper(entity)});
      } else if (result === 'ignored') {
        // do nothing
      } else {
        assertNever(result, 'Unknown upsert result');
      }
    }

    const entitiesById = new Map<string, TSource>(entities.map(e => [this.idMapper(e), e]));

    for (const event of events) {
      const config = entitiesById.get(event.data.entityId);
      if (config) continue; // already upserted

      const result = await this.target.delete(event.data.entityId);
      if (result.type === 'ignored') continue; // already deleted

      this.observer.next({type: 'deleted', entity: result.entity});
    }
  }

  async stop() {
    this._isStopped = true;
    if (this.loopPromise) {
      await this.loopPromise;
    }
  }

  async destroy() {
    this.stop();
    await this.consumer.destroy();
    this.observer.complete();
  }
}

async function* dump<T>(source: ReplicatorSource<T>): AsyncGenerator<T[]> {
  const ids = await source.getIds();

  for (const batch of chunkArray(ids, REPLICATOR_CONFIGS_DUMP_BATCH_SIZE)) {
    yield await source.getByIds(batch);
  }
}

export class ReplicatorService<TSource, TTarget> implements Service {
  readonly name = 'Replica';

  private replicator: Replicator<TSource, TTarget> | null = null;

  constructor(
    private readonly source: ReplicatorSource<TSource>,
    private readonly target: ReplicatorTarget<TTarget>,
    private readonly topic: EventHubTopic<EntityChangeEvent>,
    private readonly mapper: (source: TSource) => TTarget,
    private readonly idMapper: (source: TSource) => string,
    private readonly logger: Logger,
    private readonly onFatalError: (error: unknown) => void,
    private readonly eventSubject: Subject<ReplicatorEvent<TTarget>>,
  ) {}

  get isStopped() {
    return this.replicator?.isStopped ?? true;
  }

  async sync() {
    if (!this.replicator) {
      throw new Error('Replicator not started');
    }
    await this.replicator.sync();
  }

  async start(ctx: Context) {
    const replicator = await Replicator.create(
      this.source,
      this.target,
      this.mapper,
      this.idMapper,
      this.topic,
      this.logger,
      this.onFatalError,
      this.eventSubject,
    );
    this.replicator = replicator;
  }

  async stop(ctx: Context) {
    await this.replicator?.stop();
  }
}
