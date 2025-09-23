import type {Service} from './service';

export interface AsyncWorkerOptions {
  name: string;
  task: () => Promise<void>;
  onError: (err: unknown) => void;
}

export class AsyncWorker implements Service {
  private started = false;
  private running = false;
  private rescheduleRequested = false;

  readonly name: string;

  constructor(private readonly options: AsyncWorkerOptions) {
    this.name = options.name;
  }

  async start() {
    if (this.started) return;
    this.started = true;

    await this.run();
  }

  async stop() {
    this.started = false;
  }

  wakeup() {
    if (!this.started) {
      throw new Error(`AsyncWorker ${this.options.name} not started`);
    }
    if (this.running) {
      this.rescheduleRequested = true;
      return;
    }
    this.run();
  }

  private async run() {
    if (this.running || !this.started) {
      return;
    }

    this.running = true;
    this.rescheduleRequested = false;

    try {
      await this.options.task();
    } catch (err) {
      this.options.onError(err);
    } finally {
      this.running = false;
    }

    if (this.rescheduleRequested) {
      this.run();
    }
  }
}
