import type {RenderedOverride} from './override-evaluator';
import type {Brand} from './utils';

export interface ConfigVariantReplica {
  variantId: string;
  name: string;
  projectId: string;
  environmentId: string;
  value: unknown;
  renderedOverrides: RenderedOverride[];
  version: number;
}

function toConfigVariantKey(params: {
  projectId: string;
  name: string;
  environmentId: string;
}): ConfigVariantKey {
  return `${params.projectId}::${params.name}::${params.environmentId}` as ConfigVariantKey;
}

function toEnvironmentKey(params: {projectId: string; environmentId: string}): EnvironmentKey {
  return `${params.projectId}::${params.environmentId}` as EnvironmentKey;
}

type ConfigVariantKey = Brand<string, 'ConfigVariantKey'>;
type EnvironmentKey = Brand<string, 'EnvironmentKey'>;

export class ConfigsReplicaStore {
  private variantsByKey: Map<ConfigVariantKey, ConfigVariantReplica> = new Map();
  private variantsById: Map<string, ConfigVariantReplica> = new Map();
  private variantsByEnv: Map<EnvironmentKey, ConfigVariantReplica[]> = new Map();

  constructor(variants: ConfigVariantReplica[] = []) {
    for (const variant of variants) {
      this.upsert(variant);
    }
  }

  getByVariantKey(params: {
    projectId: string;
    name: string;
    environmentId: string;
  }): ConfigVariantReplica | undefined {
    return this.variantsByKey.get(toConfigVariantKey(params));
  }

  getById(variantId: string): ConfigVariantReplica | undefined {
    return this.variantsById.get(variantId);
  }

  getByEnvironment(params: {projectId: string; environmentId: string}): ConfigVariantReplica[] {
    return this.variantsByEnv.get(toEnvironmentKey(params)) ?? [];
  }

  upsert(variant: ConfigVariantReplica) {
    const variantKey = toConfigVariantKey({
      projectId: variant.projectId,
      name: variant.name,
      environmentId: variant.environmentId,
    });
    this.variantsByKey.set(variantKey, variant);
    this.variantsById.set(variant.variantId, variant);
    const envKey = toEnvironmentKey({
      projectId: variant.projectId,
      environmentId: variant.environmentId,
    });
    this.variantsByEnv.set(envKey, [
      ...(this.variantsByEnv.get(envKey) ?? []).filter(v => v.variantId !== variant.variantId),
      variant,
    ]);
  }

  delete(variantId: string) {
    const variant = this.variantsById.get(variantId);
    if (!variant) {
      return;
    }

    const variantKey = toConfigVariantKey({
      projectId: variant.projectId,
      name: variant.name,
      environmentId: variant.environmentId,
    });
    this.variantsByKey.delete(variantKey);
    this.variantsById.delete(variantId);
    const envKey = toEnvironmentKey({
      projectId: variant.projectId,
      environmentId: variant.environmentId,
    });
    this.variantsByEnv.set(envKey, [
      ...(this.variantsByEnv.get(envKey) ?? []).filter(v => v.variantId !== variant.variantId),
    ]);
  }

  getAllVariantsById(): Map<string, ConfigVariantReplica> {
    return new Map(this.variantsById);
  }
}
