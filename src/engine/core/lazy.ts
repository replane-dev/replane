import {Mutex} from './mutex';

export class Lazy<T> {
  private mutex = new Mutex();
  private value: {value: T} | undefined;

  constructor(private readonly init: () => Promise<T>) {}

  async get(): Promise<T> {
    if (this.value) {
      return this.value.value;
    }

    return await this.mutex.run(async () => {
      if (!this.value) {
        const v = await this.init();
        this.value = {value: v};
      }
      return this.value.value;
    });
  }
}
