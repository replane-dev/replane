import type {RenderedOverride} from './override-evaluator';
import type {Brand} from './utils';

export interface ConfigReplica {
  configId: string;
  name: string;
  projectId: string;
  environmentId: string;
  value: unknown;
  renderedOverrides: RenderedOverride[];
  version: number;
}

function toConfigReplicaKey(params: {
  projectId: string;
  name: string;
  environmentId: string;
}): ConfigReplicaKey {
  return `${params.projectId}::${params.name}::${params.environmentId}` as ConfigReplicaKey;
}

function toEnvironmentKey(params: {projectId: string; environmentId: string}): EnvironmentKey {
  return `${params.projectId}::${params.environmentId}` as EnvironmentKey;
}

type ConfigReplicaKey = Brand<string, 'ConfigReplicaKey'>;
type EnvironmentKey = Brand<string, 'EnvironmentKey'>;

export class ConfigsReplicaStore {
  private variantsByKey: Map<ConfigReplicaKey, ConfigReplica> = new Map();
  private variantsByEnv: Map<EnvironmentKey, ConfigReplica[]> = new Map();
  private variantsByConfigId: Map<string, ConfigReplica[]> = new Map();

  constructor(variants: ConfigReplica[] = []) {
    for (const variant of variants) {
      this.upsert(variant);
    }
  }

  getByVariantKey(params: {
    projectId: string;
    name: string;
    environmentId: string;
  }): ConfigReplica | undefined {
    return this.variantsByKey.get(toConfigReplicaKey(params));
  }

  getByEnvironment(params: {projectId: string; environmentId: string}): ConfigReplica[] {
    return this.variantsByEnv.get(toEnvironmentKey(params)) ?? [];
  }

  getByConfigId(configId: string): ConfigReplica[] {
    return this.variantsByConfigId.get(configId) ?? [];
  }

  upsert(variant: ConfigReplica) {
    const variantKey = toConfigReplicaKey({
      projectId: variant.projectId,
      name: variant.name,
      environmentId: variant.environmentId,
    });
    this.variantsByKey.set(variantKey, variant);
    const envKey = toEnvironmentKey({
      projectId: variant.projectId,
      environmentId: variant.environmentId,
    });
    // Remove old variant with same name and add the new one
    this.variantsByEnv.set(envKey, [
      ...(this.variantsByEnv.get(envKey) ?? []).filter(v => v.name !== variant.name),
      variant,
    ]);
    this.variantsByConfigId.set(variant.configId, [
      ...(this.variantsByConfigId.get(variant.configId) ?? []).filter(
        v => v.environmentId !== variant.environmentId,
      ),
      variant,
    ]);
  }

  delete(params: {projectId: string; name: string; environmentId: string}) {
    const variantKey = toConfigReplicaKey(params);
    const variant = this.variantsByKey.get(variantKey);
    if (!variant) {
      return;
    }

    this.variantsByKey.delete(variantKey);
    const envKey = toEnvironmentKey({
      projectId: params.projectId,
      environmentId: params.environmentId,
    });
    this.variantsByEnv.set(envKey, [
      ...(this.variantsByEnv.get(envKey) ?? []).filter(v => v.name !== params.name),
    ]);
    this.variantsByConfigId.set(variant.configId, [
      ...(this.variantsByConfigId.get(variant.configId) ?? []).filter(
        v => v.environmentId !== variant.environmentId,
      ),
    ]);
  }
}
