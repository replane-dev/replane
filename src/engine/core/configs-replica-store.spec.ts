import {describe, expect, it} from 'vitest';
import {ConfigsReplicaStore, type ConfigReplica} from './configs-replica-store';

describe('ConfigsReplicaStore.getByConfigId', () => {
  it('returns empty array for empty store', () => {
    const store = new ConfigsReplicaStore();
    const result = store.getByConfigId('non-existent-config-id');
    expect(result).toEqual([]);
  });

  it('returns empty array for non-existent configId', () => {
    const store = new ConfigsReplicaStore();
    store.upsert({
      configId: 'config-1',
      name: 'feature-flags',
      projectId: 'project-1',
      environmentId: 'env-prod',
      value: {enabled: true},
      renderedOverrides: [],
      version: 1,
    });

    const result = store.getByConfigId('non-existent-config-id');
    expect(result).toEqual([]);
  });

  it('returns single variant for config with one environment', () => {
    const store = new ConfigsReplicaStore();
    const variant: ConfigReplica = {
      configId: 'config-1',
      name: 'feature-flags',
      projectId: 'project-1',
      environmentId: 'env-prod',
      value: {enabled: true},
      renderedOverrides: [],
      version: 1,
    };
    store.upsert(variant);

    const result = store.getByConfigId('config-1');
    expect(result).toHaveLength(1);
    expect(result[0]).toEqual(variant);
  });

  it('returns multiple variants for config with multiple environments', () => {
    const store = new ConfigsReplicaStore();
    const variant1: ConfigReplica = {
      configId: 'config-1',
      name: 'feature-flags',
      projectId: 'project-1',
      environmentId: 'env-prod',
      value: {enabled: true},
      renderedOverrides: [],
      version: 1,
    };
    const variant2: ConfigReplica = {
      configId: 'config-1',
      name: 'feature-flags',
      projectId: 'project-1',
      environmentId: 'env-dev',
      value: {enabled: false},
      renderedOverrides: [],
      version: 1,
    };
    const variant3: ConfigReplica = {
      configId: 'config-1',
      name: 'feature-flags',
      projectId: 'project-1',
      environmentId: 'env-staging',
      value: {enabled: true, beta: true},
      renderedOverrides: [],
      version: 2,
    };

    store.upsert(variant1);
    store.upsert(variant2);
    store.upsert(variant3);

    const result = store.getByConfigId('config-1');
    expect(result).toHaveLength(3);
    expect(result).toContainEqual(variant1);
    expect(result).toContainEqual(variant2);
    expect(result).toContainEqual(variant3);
  });

  it('returns only variants matching the specified configId when multiple configs exist', () => {
    const store = new ConfigsReplicaStore();
    const config1Variant1: ConfigReplica = {
      configId: 'config-1',
      name: 'feature-flags',
      projectId: 'project-1',
      environmentId: 'env-prod',
      value: {enabled: true},
      renderedOverrides: [],
      version: 1,
    };
    const config1Variant2: ConfigReplica = {
      configId: 'config-1',
      name: 'feature-flags',
      projectId: 'project-1',
      environmentId: 'env-dev',
      value: {enabled: false},
      renderedOverrides: [],
      version: 1,
    };
    const config2Variant1: ConfigReplica = {
      configId: 'config-2',
      name: 'rate-limits',
      projectId: 'project-1',
      environmentId: 'env-prod',
      value: {limit: 1000},
      renderedOverrides: [],
      version: 1,
    };
    const config2Variant2: ConfigReplica = {
      configId: 'config-2',
      name: 'rate-limits',
      projectId: 'project-1',
      environmentId: 'env-dev',
      value: {limit: 100},
      renderedOverrides: [],
      version: 1,
    };

    store.upsert(config1Variant1);
    store.upsert(config1Variant2);
    store.upsert(config2Variant1);
    store.upsert(config2Variant2);

    const result1 = store.getByConfigId('config-1');
    expect(result1).toHaveLength(2);
    expect(result1).toContainEqual(config1Variant1);
    expect(result1).toContainEqual(config1Variant2);
    expect(result1).not.toContainEqual(config2Variant1);
    expect(result1).not.toContainEqual(config2Variant2);

    const result2 = store.getByConfigId('config-2');
    expect(result2).toHaveLength(2);
    expect(result2).toContainEqual(config2Variant1);
    expect(result2).toContainEqual(config2Variant2);
    expect(result2).not.toContainEqual(config1Variant1);
    expect(result2).not.toContainEqual(config1Variant2);
  });

  it('reflects updated variant after upsert', () => {
    const store = new ConfigsReplicaStore();
    const originalVariant: ConfigReplica = {
      configId: 'config-1',
      name: 'feature-flags',
      projectId: 'project-1',
      environmentId: 'env-prod',
      value: {enabled: true},
      renderedOverrides: [],
      version: 1,
    };
    store.upsert(originalVariant);

    const updatedVariant: ConfigReplica = {
      configId: 'config-1',
      name: 'feature-flags',
      projectId: 'project-1',
      environmentId: 'env-prod',
      value: {enabled: false},
      renderedOverrides: [],
      version: 2,
    };
    store.upsert(updatedVariant);

    const result = store.getByConfigId('config-1');
    expect(result).toHaveLength(1);
    expect(result[0]).toEqual(updatedVariant);
    expect(result[0]?.version).toBe(2);
    expect(result[0]?.value).toEqual({enabled: false});
  });

  it('reflects new variant after upsert to existing config', () => {
    const store = new ConfigsReplicaStore();
    const variant1: ConfigReplica = {
      configId: 'config-1',
      name: 'feature-flags',
      projectId: 'project-1',
      environmentId: 'env-prod',
      value: {enabled: true},
      renderedOverrides: [],
      version: 1,
    };
    store.upsert(variant1);

    expect(store.getByConfigId('config-1')).toHaveLength(1);

    const variant2: ConfigReplica = {
      configId: 'config-1',
      name: 'feature-flags',
      projectId: 'project-1',
      environmentId: 'env-dev',
      value: {enabled: false},
      renderedOverrides: [],
      version: 1,
    };
    store.upsert(variant2);

    const result = store.getByConfigId('config-1');
    expect(result).toHaveLength(2);
    expect(result).toContainEqual(variant1);
    expect(result).toContainEqual(variant2);
  });

  it('reflects deletion of variant', () => {
    const store = new ConfigsReplicaStore();
    const variant1: ConfigReplica = {
      configId: 'config-1',
      name: 'feature-flags',
      projectId: 'project-1',
      environmentId: 'env-prod',
      value: {enabled: true},
      renderedOverrides: [],
      version: 1,
    };
    const variant2: ConfigReplica = {
      configId: 'config-1',
      name: 'feature-flags',
      projectId: 'project-1',
      environmentId: 'env-dev',
      value: {enabled: false},
      renderedOverrides: [],
      version: 1,
    };

    store.upsert(variant1);
    store.upsert(variant2);
    expect(store.getByConfigId('config-1')).toHaveLength(2);

    store.delete({
      projectId: 'project-1',
      name: 'feature-flags',
      environmentId: 'env-prod',
    });

    const result = store.getByConfigId('config-1');
    expect(result).toHaveLength(1);
    expect(result[0]).toEqual(variant2);
    expect(result).not.toContainEqual(variant1);
  });

  it('returns empty array after deleting all variants of a config', () => {
    const store = new ConfigsReplicaStore();
    const variant1: ConfigReplica = {
      configId: 'config-1',
      name: 'feature-flags',
      projectId: 'project-1',
      environmentId: 'env-prod',
      value: {enabled: true},
      renderedOverrides: [],
      version: 1,
    };
    const variant2: ConfigReplica = {
      configId: 'config-1',
      name: 'feature-flags',
      projectId: 'project-1',
      environmentId: 'env-dev',
      value: {enabled: false},
      renderedOverrides: [],
      version: 1,
    };

    store.upsert(variant1);
    store.upsert(variant2);
    expect(store.getByConfigId('config-1')).toHaveLength(2);

    store.delete({
      projectId: 'project-1',
      name: 'feature-flags',
      environmentId: 'env-prod',
    });
    store.delete({
      projectId: 'project-1',
      name: 'feature-flags',
      environmentId: 'env-dev',
    });

    const result = store.getByConfigId('config-1');
    expect(result).toEqual([]);
  });

  it('does not affect other configs when deleting variants', () => {
    const store = new ConfigsReplicaStore();
    const config1Variant: ConfigReplica = {
      configId: 'config-1',
      name: 'feature-flags',
      projectId: 'project-1',
      environmentId: 'env-prod',
      value: {enabled: true},
      renderedOverrides: [],
      version: 1,
    };
    const config2Variant: ConfigReplica = {
      configId: 'config-2',
      name: 'rate-limits',
      projectId: 'project-1',
      environmentId: 'env-prod',
      value: {limit: 1000},
      renderedOverrides: [],
      version: 1,
    };

    store.upsert(config1Variant);
    store.upsert(config2Variant);

    store.delete({
      projectId: 'project-1',
      name: 'feature-flags',
      environmentId: 'env-prod',
    });

    expect(store.getByConfigId('config-1')).toEqual([]);
    expect(store.getByConfigId('config-2')).toHaveLength(1);
    expect(store.getByConfigId('config-2')[0]).toEqual(config2Variant);
  });

  it('initializes correctly with variants in constructor', () => {
    const variants: ConfigReplica[] = [
      {
        configId: 'config-1',
        name: 'feature-flags',
        projectId: 'project-1',
        environmentId: 'env-prod',
        value: {enabled: true},
        renderedOverrides: [],
        version: 1,
      },
      {
        configId: 'config-1',
        name: 'feature-flags',
        projectId: 'project-1',
        environmentId: 'env-dev',
        value: {enabled: false},
        renderedOverrides: [],
        version: 1,
      },
      {
        configId: 'config-2',
        name: 'rate-limits',
        projectId: 'project-1',
        environmentId: 'env-prod',
        value: {limit: 1000},
        renderedOverrides: [],
        version: 1,
      },
    ];

    const store = new ConfigsReplicaStore(variants);

    const result1 = store.getByConfigId('config-1');
    expect(result1).toHaveLength(2);
    expect(result1).toContainEqual(variants[0]);
    expect(result1).toContainEqual(variants[1]);

    const result2 = store.getByConfigId('config-2');
    expect(result2).toHaveLength(1);
    expect(result2[0]).toEqual(variants[2]);
  });

  it('handles configs with same name but different projects (different configIds)', () => {
    const store = new ConfigsReplicaStore();
    const project1Variant: ConfigReplica = {
      configId: 'config-1-in-project-1',
      name: 'feature-flags',
      projectId: 'project-1',
      environmentId: 'env-prod',
      value: {enabled: true},
      renderedOverrides: [],
      version: 1,
    };
    const project2Variant: ConfigReplica = {
      configId: 'config-1-in-project-2',
      name: 'feature-flags',
      projectId: 'project-2',
      environmentId: 'env-prod',
      value: {enabled: false},
      renderedOverrides: [],
      version: 1,
    };

    store.upsert(project1Variant);
    store.upsert(project2Variant);

    const result1 = store.getByConfigId('config-1-in-project-1');
    expect(result1).toHaveLength(1);
    expect(result1[0]).toEqual(project1Variant);

    const result2 = store.getByConfigId('config-1-in-project-2');
    expect(result2).toHaveLength(1);
    expect(result2[0]).toEqual(project2Variant);
  });

  it('handles variants with complex values and overrides', () => {
    const store = new ConfigsReplicaStore();
    const variant: ConfigReplica = {
      configId: 'config-1',
      name: 'feature-flags',
      projectId: 'project-1',
      environmentId: 'env-prod',
      value: {
        features: {
          darkMode: true,
          betaAccess: false,
          limits: {
            maxUsers: 1000,
            maxProjects: 10,
          },
        },
      },
      renderedOverrides: [
        {
          name: 'override-1',
          value: {features: {darkMode: false}},
          conditions: [],
        },
      ],
      version: 5,
    };

    store.upsert(variant);

    const result = store.getByConfigId('config-1');
    expect(result).toHaveLength(1);
    expect(result[0]).toEqual(variant);
    expect(result[0]?.value).toEqual(variant.value);
    expect(result[0]?.renderedOverrides).toEqual(variant.renderedOverrides);
  });

  it('preserves order of variants across multiple upserts', () => {
    const store = new ConfigsReplicaStore();
    const variant1: ConfigReplica = {
      configId: 'config-1',
      name: 'feature-flags',
      projectId: 'project-1',
      environmentId: 'env-prod',
      value: {enabled: true},
      renderedOverrides: [],
      version: 1,
    };
    const variant2: ConfigReplica = {
      configId: 'config-1',
      name: 'feature-flags',
      projectId: 'project-1',
      environmentId: 'env-dev',
      value: {enabled: false},
      renderedOverrides: [],
      version: 1,
    };
    const variant3: ConfigReplica = {
      configId: 'config-1',
      name: 'feature-flags',
      projectId: 'project-1',
      environmentId: 'env-staging',
      value: {enabled: true},
      renderedOverrides: [],
      version: 1,
    };

    store.upsert(variant1);
    store.upsert(variant2);
    store.upsert(variant3);

    const result = store.getByConfigId('config-1');
    expect(result).toHaveLength(3);
    
    // Verify all variants are present (order may vary)
    const environmentIds = result.map(v => v.environmentId);
    expect(environmentIds).toContain('env-prod');
    expect(environmentIds).toContain('env-dev');
    expect(environmentIds).toContain('env-staging');
  });

  it('handles multiple sequential deletes and upserts', () => {
    const store = new ConfigsReplicaStore();
    const variant1: ConfigReplica = {
      configId: 'config-1',
      name: 'feature-flags',
      projectId: 'project-1',
      environmentId: 'env-prod',
      value: {enabled: true},
      renderedOverrides: [],
      version: 1,
    };
    const variant2: ConfigReplica = {
      configId: 'config-1',
      name: 'feature-flags',
      projectId: 'project-1',
      environmentId: 'env-dev',
      value: {enabled: false},
      renderedOverrides: [],
      version: 1,
    };

    // Add both
    store.upsert(variant1);
    store.upsert(variant2);
    expect(store.getByConfigId('config-1')).toHaveLength(2);

    // Delete one
    store.delete({
      projectId: 'project-1',
      name: 'feature-flags',
      environmentId: 'env-prod',
    });
    expect(store.getByConfigId('config-1')).toHaveLength(1);

    // Add it back with updated value
    const updatedVariant1: ConfigReplica = {
      ...variant1,
      value: {enabled: false},
      version: 2,
    };
    store.upsert(updatedVariant1);
    expect(store.getByConfigId('config-1')).toHaveLength(2);

    const result = store.getByConfigId('config-1');
    const prodVariant = result.find(v => v.environmentId === 'env-prod');
    expect(prodVariant?.version).toBe(2);
    expect(prodVariant?.value).toEqual({enabled: false});
  });
});

