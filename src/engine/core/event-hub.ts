import assert from 'assert';
import {Kysely} from 'kysely';
import {
  REPLICA_CLEANUP_FREQUENCY,
  REPLICA_LAST_USED_AT_CUTOFF_MS,
  REPLICA_LAST_USED_AT_REPORT_FREQUENCY,
} from './constants';
import type {Context} from './context';
import type {DateProvider} from './date-provider';
import type {DB} from './db';
import type {Logger} from './logger';
import type {Topic, TopicConsumer} from './topic';

// error for consumer destroyed by the user
export class ConsumerDestroyedError extends Error {
  constructor(message: string, options: {cause?: unknown} = {}) {
    super(message, options);
    this.name = 'ConsumerDestroyedError';
  }
}

export class EventHub<T extends object> {
  constructor(
    private readonly dbForConsumer: Kysely<DB>,
    private readonly dateProvider: DateProvider,
  ) {}

  getTopic<K extends keyof T>(topic: K): EventHubTopic<T[K]> {
    assert(typeof topic === 'string', 'Topic must be a string');

    return new EventHubTopic(this.dbForConsumer, this.dateProvider, topic);
  }
}

export class EventHubTopic<T> implements Topic<T> {
  constructor(
    private readonly dbForConsumer: Kysely<DB>,
    private readonly dateProvider: DateProvider,
    private readonly topic: string,
  ) {}

  async createConsumer(): Promise<TopicConsumer<T>> {
    const consumer = await this.dbForConsumer
      .insertInto('event_consumers')
      .values({
        created_at: this.dateProvider.now(),
        last_used_at: this.dateProvider.now(),
        topic: this.topic,
      })
      .returning(['id'])
      .executeTakeFirstOrThrow();

    return new EventHubConsumer<T>(this.dbForConsumer, this.dateProvider, consumer.id);
  }

  async tryRestoreConsumer(consumerId: string): Promise<TopicConsumer<T> | undefined> {
    const affected = await this.dbForConsumer
      .updateTable('event_consumers')
      .set({
        last_used_at: this.dateProvider.now(),
      })
      .where('id', '=', consumerId)
      .where('topic', '=', this.topic)
      .execute();

    if (affected.length !== 1) {
      return undefined;
    }

    return new EventHubConsumer<T>(this.dbForConsumer, this.dateProvider, consumerId);
  }
}

export class EventHubPublisher<T extends object> {
  private static cleanupCounter = REPLICA_CLEANUP_FREQUENCY; // so that the first cleanup happens immediately

  constructor(
    private readonly db: Kysely<DB>,
    private readonly logger: Logger,
    private readonly dateProvider: DateProvider,
  ) {}

  async pushEvent<K extends keyof T>(ctx: Context, topic: K, event: T[K]) {
    assert(typeof topic === 'string', 'Topic must be a string');

    EventHubPublisher.cleanupCounter++;
    if (EventHubPublisher.cleanupCounter >= REPLICA_CLEANUP_FREQUENCY) {
      EventHubPublisher.cleanupCounter = 0;

      await this.cleanupOldConsumers(ctx);
    }

    const consumerIds = await this.db
      .selectFrom('event_consumers')
      .select(['id'])
      .where('topic', '=', topic)
      .execute();

    if (consumerIds.length === 0) {
      return;
    }

    await this.db
      .insertInto('events')
      .values(
        consumerIds.map(consumer => ({
          consumer_id: consumer.id,
          data: JSON.stringify(event),
          created_at: this.dateProvider.now(),
        })),
      )
      .execute();
  }

  private async cleanupOldConsumers(ctx: Context) {
    const cutoff = new Date(this.dateProvider.now().getTime() - REPLICA_LAST_USED_AT_CUTOFF_MS);

    const consumers = await this.db
      .deleteFrom('event_consumers')
      .where('last_used_at', '<', cutoff)
      .returningAll()
      .execute();

    if (consumers.length > 0) {
      this.logger.info(ctx, {msg: 'Cleaned up old consumers', consumers});
    }
  }
}

export interface Event {
  id: string;
  data: unknown;
}

export class EventHubConsumer<T> implements TopicConsumer<T> {
  private isDestroyed = false;
  private reportCounter = REPLICA_LAST_USED_AT_REPORT_FREQUENCY; // so that the first report happens immediately

  constructor(
    private readonly db: Kysely<DB>,
    private readonly dateProvider: DateProvider,
    public readonly consumerId: string,
  ) {}

  async isAlive(): Promise<boolean> {
    const consumer = await this.db
      .selectFrom('event_consumers')
      .select(['id'])
      .where('id', '=', this.consumerId)
      .executeTakeFirst();

    return !!consumer;
  }

  async pullEvents(count: number): Promise<{id: string; data: T}[]> {
    if (this.isDestroyed) {
      throw new ConsumerDestroyedError(`Consumer ${this.consumerId} is destroyed`);
    }

    const events = await this.db
      .selectFrom('events')
      .where('consumer_id', '=', this.consumerId)
      .select(['id', 'data'])
      .orderBy('created_at', 'asc')
      .limit(count)
      .execute();

    this.reportCounter++;
    if (this.reportCounter >= REPLICA_LAST_USED_AT_REPORT_FREQUENCY) {
      this.reportCounter = 0;

      await this.reportLastUsedAt();
    }

    return events.map(event => ({
      id: event.id,
      data: JSON.parse(event.data) as T,
    }));
  }

  private async reportLastUsedAt() {
    const consumers = await this.db
      .updateTable('event_consumers')
      .set({
        last_used_at: this.dateProvider.now(),
      })
      .where('id', '=', this.consumerId)
      .returningAll()
      .execute();

    if (consumers.length !== 1) {
      throw new ConsumerDestroyedError(`Consumer ${this.consumerId} is destroyed`);
    }
  }

  async ackEvents(eventIds: string[]) {
    if (eventIds.length === 0) {
      return;
    }

    if (this.isDestroyed) {
      throw new ConsumerDestroyedError(`Consumer ${this.consumerId} is destroyed`);
    }

    await this.db.deleteFrom('events').where('id', 'in', eventIds).execute();
  }

  async destroy() {
    if (this.isDestroyed) {
      throw new ConsumerDestroyedError(`Consumer ${this.consumerId} is destroyed`);
    }

    this.isDestroyed = true;
    await this.db.deleteFrom('event_consumers').where('id', '=', this.consumerId).execute();
  }
}
