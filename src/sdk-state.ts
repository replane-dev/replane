import type {ConfigDto, StartReplicationStreamBody} from './sdk-api';

export class RollingState {
  // we store only versions to reduce memory usage
  private readonly configVersions: Map<string, number>;

  constructor(versions: Iterable<[string, number]>) {
    this.configVersions = new Map(versions);
  }

  upsert(configName: string, version: number): 'upserted' | 'ignored' {
    const existingVersion = this.configVersions.get(configName);
    if (existingVersion && existingVersion >= version) {
      return 'ignored';
    }
    this.configVersions.set(configName, version);
    return 'upserted';
  }
}

export function createSdkState(
  options: StartReplicationStreamBody & {serverConfigs: ConfigDto[]},
): {
  rollingState: RollingState;
  configs: ConfigDto[];
} {
  const configs = new Map<string, ConfigDto>();
  const addConfig = (config: ConfigDto) => {
    const existingConfig = configs.get(config.name);
    if (existingConfig && existingConfig.version >= config.version) {
      return;
    }
    configs.set(config.name, config);
  };

  for (const config of options.currentConfigs) {
    addConfig(config);
  }

  for (const config of options.serverConfigs) {
    addConfig(config);
  }

  for (const config of options.fallbacks) {
    addConfig(config);
  }

  const missingConfigs = new Set<string>();
  for (const configName of options.requiredConfigs) {
    if (!configs.has(configName)) {
      missingConfigs.add(configName);
    }
  }
  if (missingConfigs.size > 0) {
    throw new Error(`Required configs not found: ${Array.from(missingConfigs).join(', ')}`);
  }

  return {
    rollingState: new RollingState(configs.values().map(config => [config.name, config.version])),
    configs: Array.from(configs.values()),
  };
}
