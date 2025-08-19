import {ConflictError, type Config, type ConfigStore} from './core/config-store.js';

export class MemConfigStore implements ConfigStore {
  private readonly configs = new Map<string, Config>();

  async getAll(): Promise<Config[]> {
    return [...this.configs.values()];
  }

  async get(name: string): Promise<Config | undefined> {
    return this.configs.get(name);
  }

  async put(config: Config): Promise<void> {
    const existing = await this.get(config.name);

    if (config.version === 1 && existing) {
      throw new ConflictError(
        `Concurrency error while trying to create config ${config.name} with version = 1: config already exists`,
      );
    }

    if (!existing) {
      throw new ConflictError(
        `Concurrency error while trying to update config ${config.name}, version = ${config.version}. Previous version doesn't exist.`,
      );
    }

    if (existing.version !== config.version - 1) {
      throw new ConflictError(
        `Concurrency error while trying to update config ${
          config.name
        }: expected version ${existing.version + 1}, but got ${config.version}`,
      );
    }

    this.configs.set(config.name, config);
  }
}
