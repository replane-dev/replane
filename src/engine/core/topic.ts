export interface TopicConsumer<T> {
  readonly consumerId: string;
  readonly topic: string;
  isAlive(): Promise<boolean>;
  pullEvents(count: number): Promise<{id: string; data: T}[]>;
  ackEvents(eventIds: string[]): Promise<void>;
  destroy(): Promise<void>;
}

export interface Topic<T> {
  createConsumer(): Promise<TopicConsumer<T>>;
  tryRestoreConsumer(consumerId: string): Promise<TopicConsumer<T> | undefined>;
}

export class MappedTopicConsumer<TSource, TTarget> implements TopicConsumer<TTarget> {
  constructor(
    private readonly consumer: TopicConsumer<TSource>,
    private readonly mapper: (source: TSource) => TTarget,
  ) {}

  get consumerId(): string {
    return this.consumer.consumerId;
  }

  get topic(): string {
    return this.consumer.topic;
  }

  async isAlive(): Promise<boolean> {
    return await this.consumer.isAlive();
  }
  async pullEvents(count: number): Promise<{id: string; data: TTarget}[]> {
    const events = await this.consumer.pullEvents(count);
    return events.map(event => ({id: event.id, data: this.mapper(event.data)}));
  }
  async ackEvents(eventIds: string[]): Promise<void> {
    await this.consumer.ackEvents(eventIds);
  }
  async destroy(): Promise<void> {
    await this.consumer.destroy();
  }
}

export class MappedTopic<TSource, TTarget> implements Topic<TTarget> {
  constructor(
    private readonly topic: Topic<TSource>,
    private readonly mapper: (source: TSource) => TTarget,
  ) {}

  async createConsumer(): Promise<TopicConsumer<TTarget>> {
    return new MappedTopicConsumer(await this.topic.createConsumer(), this.mapper);
  }
  async tryRestoreConsumer(consumerId: string): Promise<TopicConsumer<TTarget> | undefined> {
    const consumer = await this.topic.tryRestoreConsumer(consumerId);
    if (!consumer) return undefined;
    return new MappedTopicConsumer(consumer, this.mapper);
  }
}
