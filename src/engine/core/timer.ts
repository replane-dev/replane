import type {Service} from './service';

export interface TimerOptions {
  intervalMs: number;
  task: () => Promise<void>;
  onError: (error: unknown) => void;
}

export class Timer implements Service {
  private timeoutId: NodeJS.Timeout | null = null;

  readonly name = 'Timer';

  constructor(private options: TimerOptions) {}

  async start() {
    this.stop();
    const run = () => {
      this.timeoutId = setTimeout(async () => {
        try {
          await this.options.task();
        } catch (error) {
          this.options.onError(error);
        } finally {
          run();
        }
      }, this.options.intervalMs);
    };

    run();
  }

  async stop() {
    if (this.timeoutId) {
      clearTimeout(this.timeoutId);
      this.timeoutId = null;
    }
  }
}
