import {describe, expect, it} from 'vitest';
import {ConfigsReplicaStore, type ConfigVariantReplica} from './configs-replica-store';

describe('ConfigsReplicaStore', () => {
  const createVariant = (overrides: Partial<ConfigVariantReplica> = {}): ConfigVariantReplica => ({
    variantId: 'variant-1',
    name: 'featureFlag',
    projectId: 'project-1',
    environmentId: 'env-1',
    value: {enabled: true},
    renderedOverrides: [],
    version: 1,
    ...overrides,
  });

  describe('constructor', () => {
    it('should create an empty store when no variants are provided', () => {
      const store = new ConfigsReplicaStore();

      expect(store.getById('any-id')).toBeUndefined();
      expect(store.getByEnvironment({projectId: 'any', environmentId: 'any'})).toEqual([]);
    });

    it('should create a store with initial variants', () => {
      const variant1 = createVariant({variantId: 'var-1', name: 'config1'});
      const variant2 = createVariant({variantId: 'var-2', name: 'config2'});

      const store = new ConfigsReplicaStore([variant1, variant2]);

      expect(store.getById('var-1')).toEqual(variant1);
      expect(store.getById('var-2')).toEqual(variant2);
    });

    it('should handle duplicate variants in initial array by keeping the last one', () => {
      const variant1 = createVariant({variantId: 'var-1', value: 'first'});
      const variant2 = createVariant({variantId: 'var-1', value: 'second'});

      const store = new ConfigsReplicaStore([variant1, variant2]);

      expect(store.getById('var-1')?.value).toBe('second');
    });
  });

  describe('getByVariantKey', () => {
    it('should return variant by project, name, and environment key', () => {
      const variant = createVariant({
        projectId: 'proj-1',
        name: 'myConfig',
        environmentId: 'env-prod',
      });

      const store = new ConfigsReplicaStore([variant]);

      const result = store.getByVariantKey({
        projectId: 'proj-1',
        name: 'myConfig',
        environmentId: 'env-prod',
      });

      expect(result).toEqual(variant);
    });

    it('should return undefined for non-existent variant key', () => {
      const store = new ConfigsReplicaStore();

      const result = store.getByVariantKey({
        projectId: 'non-existent',
        name: 'missing',
        environmentId: 'env-1',
      });

      expect(result).toBeUndefined();
    });

    it('should distinguish between different projects with same name and environment', () => {
      const variant1 = createVariant({
        variantId: 'var-1',
        projectId: 'proj-1',
        name: 'config',
        environmentId: 'env-1',
        value: 'project1-value',
      });
      const variant2 = createVariant({
        variantId: 'var-2',
        projectId: 'proj-2',
        name: 'config',
        environmentId: 'env-1',
        value: 'project2-value',
      });

      const store = new ConfigsReplicaStore([variant1, variant2]);

      expect(
        store.getByVariantKey({projectId: 'proj-1', name: 'config', environmentId: 'env-1'}),
      ).toEqual(variant1);
      expect(
        store.getByVariantKey({projectId: 'proj-2', name: 'config', environmentId: 'env-1'}),
      ).toEqual(variant2);
    });

    it('should distinguish between different environments with same project and name', () => {
      const variant1 = createVariant({
        variantId: 'var-1',
        projectId: 'proj-1',
        name: 'config',
        environmentId: 'env-dev',
        value: 'dev-value',
      });
      const variant2 = createVariant({
        variantId: 'var-2',
        projectId: 'proj-1',
        name: 'config',
        environmentId: 'env-prod',
        value: 'prod-value',
      });

      const store = new ConfigsReplicaStore([variant1, variant2]);

      expect(
        store.getByVariantKey({projectId: 'proj-1', name: 'config', environmentId: 'env-dev'}),
      ).toEqual(variant1);
      expect(
        store.getByVariantKey({projectId: 'proj-1', name: 'config', environmentId: 'env-prod'}),
      ).toEqual(variant2);
    });

    it('should distinguish between different names with same project and environment', () => {
      const variant1 = createVariant({
        variantId: 'var-1',
        projectId: 'proj-1',
        name: 'config1',
        environmentId: 'env-1',
        value: 'value1',
      });
      const variant2 = createVariant({
        variantId: 'var-2',
        projectId: 'proj-1',
        name: 'config2',
        environmentId: 'env-1',
        value: 'value2',
      });

      const store = new ConfigsReplicaStore([variant1, variant2]);

      expect(
        store.getByVariantKey({projectId: 'proj-1', name: 'config1', environmentId: 'env-1'}),
      ).toEqual(variant1);
      expect(
        store.getByVariantKey({projectId: 'proj-1', name: 'config2', environmentId: 'env-1'}),
      ).toEqual(variant2);
    });
  });

  describe('getById', () => {
    it('should return variant by id', () => {
      const variant = createVariant({variantId: 'variant-123'});
      const store = new ConfigsReplicaStore([variant]);

      const result = store.getById('variant-123');

      expect(result).toEqual(variant);
    });

    it('should return undefined for non-existent id', () => {
      const store = new ConfigsReplicaStore();

      const result = store.getById('non-existent-id');

      expect(result).toBeUndefined();
    });

    it('should return different variants for different ids', () => {
      const variant1 = createVariant({variantId: 'var-1', value: 'value1'});
      const variant2 = createVariant({variantId: 'var-2', value: 'value2'});

      const store = new ConfigsReplicaStore([variant1, variant2]);

      expect(store.getById('var-1')).toEqual(variant1);
      expect(store.getById('var-2')).toEqual(variant2);
    });
  });

  describe('getByEnvironment', () => {
    it('should return all variants for a given project and environment', () => {
      const variant1 = createVariant({
        variantId: 'var-1',
        name: 'config1',
        projectId: 'proj-1',
        environmentId: 'env-1',
      });
      const variant2 = createVariant({
        variantId: 'var-2',
        name: 'config2',
        projectId: 'proj-1',
        environmentId: 'env-1',
      });
      const variant3 = createVariant({
        variantId: 'var-3',
        name: 'config3',
        projectId: 'proj-1',
        environmentId: 'env-2',
      });

      const store = new ConfigsReplicaStore([variant1, variant2, variant3]);

      const result = store.getByEnvironment({projectId: 'proj-1', environmentId: 'env-1'});

      expect(result).toHaveLength(2);
      expect(result).toContainEqual(variant1);
      expect(result).toContainEqual(variant2);
    });

    it('should return empty array for environment with no variants', () => {
      const store = new ConfigsReplicaStore();

      const result = store.getByEnvironment({projectId: 'proj-1', environmentId: 'env-1'});

      expect(result).toEqual([]);
    });

    it('should not return variants from different projects', () => {
      const variant1 = createVariant({
        variantId: 'var-1',
        projectId: 'proj-1',
        environmentId: 'env-1',
      });
      const variant2 = createVariant({
        variantId: 'var-2',
        projectId: 'proj-2',
        environmentId: 'env-1',
      });

      const store = new ConfigsReplicaStore([variant1, variant2]);

      const result = store.getByEnvironment({projectId: 'proj-1', environmentId: 'env-1'});

      expect(result).toHaveLength(1);
      expect(result).toContainEqual(variant1);
    });

    it('should not return variants from different environments', () => {
      const variant1 = createVariant({
        variantId: 'var-1',
        projectId: 'proj-1',
        environmentId: 'env-1',
      });
      const variant2 = createVariant({
        variantId: 'var-2',
        projectId: 'proj-1',
        environmentId: 'env-2',
      });

      const store = new ConfigsReplicaStore([variant1, variant2]);

      const result = store.getByEnvironment({projectId: 'proj-1', environmentId: 'env-1'});

      expect(result).toHaveLength(1);
      expect(result).toContainEqual(variant1);
    });
  });

  describe('upsert', () => {
    it('should insert a new variant', () => {
      const store = new ConfigsReplicaStore();
      const variant = createVariant({
        variantId: 'var-1',
        projectId: 'proj-1',
        environmentId: 'env-1',
      });

      store.upsert(variant);

      expect(store.getById('var-1')).toEqual(variant);

      const envVariants = store.getByEnvironment({projectId: 'proj-1', environmentId: 'env-1'});
      expect(envVariants).toHaveLength(1);
      expect(envVariants[0]).toEqual(variant);
    });

    it('should update an existing variant by id', () => {
      const original = createVariant({
        variantId: 'var-1',
        projectId: 'proj-1',
        environmentId: 'env-1',
        value: 'original',
        version: 1,
      });
      const updated = createVariant({
        variantId: 'var-1',
        projectId: 'proj-1',
        environmentId: 'env-1',
        value: 'updated',
        version: 2,
      });

      const store = new ConfigsReplicaStore([original]);
      store.upsert(updated);

      expect(store.getById('var-1')).toEqual(updated);
      expect(store.getById('var-1')?.value).toBe('updated');
      expect(store.getById('var-1')?.version).toBe(2);

      const envVariants = store.getByEnvironment({projectId: 'proj-1', environmentId: 'env-1'});
      expect(envVariants).toHaveLength(1);
      expect(envVariants[0]).toEqual(updated);
      expect(envVariants[0].value).toBe('updated');
    });

    it('should update variant in variantsByKey map', () => {
      const original = createVariant({
        variantId: 'var-1',
        projectId: 'proj-1',
        name: 'config',
        environmentId: 'env-1',
        value: 'original',
      });
      const updated = createVariant({
        variantId: 'var-1',
        projectId: 'proj-1',
        name: 'config',
        environmentId: 'env-1',
        value: 'updated',
      });

      const store = new ConfigsReplicaStore([original]);
      store.upsert(updated);

      const result = store.getByVariantKey({
        projectId: 'proj-1',
        name: 'config',
        environmentId: 'env-1',
      });

      expect(result?.value).toBe('updated');
    });

    it('should update variant in variantsByEnv map', () => {
      const original = createVariant({
        variantId: 'var-1',
        projectId: 'proj-1',
        environmentId: 'env-1',
        value: 'original',
      });
      const updated = createVariant({
        variantId: 'var-1',
        projectId: 'proj-1',
        environmentId: 'env-1',
        value: 'updated',
      });

      const store = new ConfigsReplicaStore([original]);
      store.upsert(updated);

      const result = store.getByEnvironment({projectId: 'proj-1', environmentId: 'env-1'});

      expect(result).toHaveLength(1);
      expect(result[0].value).toBe('updated');
    });

    it('should not duplicate variants in environment list when upserting', () => {
      const original = createVariant({
        variantId: 'var-1',
        projectId: 'proj-1',
        environmentId: 'env-1',
        name: 'config',
      });
      const updated = createVariant({
        variantId: 'var-1',
        projectId: 'proj-1',
        environmentId: 'env-1',
        name: 'config',
        version: 2,
      });

      const store = new ConfigsReplicaStore([original]);
      store.upsert(updated);

      const result = store.getByEnvironment({projectId: 'proj-1', environmentId: 'env-1'});

      expect(result).toHaveLength(1);
    });

    it('should handle upsert when variant key changes (different name)', () => {
      const original = createVariant({
        variantId: 'var-1',
        projectId: 'proj-1',
        environmentId: 'env-1',
        name: 'oldName',
      });
      const updated = createVariant({
        variantId: 'var-1',
        projectId: 'proj-1',
        environmentId: 'env-1',
        name: 'newName',
      });

      const store = new ConfigsReplicaStore([original]);
      store.upsert(updated);

      expect(
        store.getByVariantKey({projectId: 'proj-1', name: 'oldName', environmentId: 'env-1'}),
      ).toEqual(original);
      expect(
        store.getByVariantKey({projectId: 'proj-1', name: 'newName', environmentId: 'env-1'}),
      ).toEqual(updated);
      expect(store.getById('var-1')).toEqual(updated);

      // Environment should contain only the updated variant (by ID)
      // The old variant key remains in variantsByKey but environment list filters by ID
      const envVariants = store.getByEnvironment({projectId: 'proj-1', environmentId: 'env-1'});
      expect(envVariants).toHaveLength(1);
      expect(envVariants[0]).toEqual(updated);
      expect(envVariants[0].name).toBe('newName');
    });

    it('should handle upsert when environment changes', () => {
      const original = createVariant({
        variantId: 'var-1',
        projectId: 'proj-1',
        environmentId: 'env-1',
        name: 'config',
      });
      const updated = createVariant({
        variantId: 'var-1',
        projectId: 'proj-1',
        environmentId: 'env-2',
        name: 'config',
      });

      const store = new ConfigsReplicaStore([original]);
      store.upsert(updated);

      const env1Variants = store.getByEnvironment({projectId: 'proj-1', environmentId: 'env-1'});
      const env2Variants = store.getByEnvironment({projectId: 'proj-1', environmentId: 'env-2'});

      // Note: upsert doesn't clean up old environment entries when environment changes
      // It only manages the new environment. The old environment still contains the original variant.
      expect(env1Variants).toHaveLength(1);
      expect(env1Variants[0]).toEqual(original);
      expect(env2Variants).toHaveLength(1);
      expect(env2Variants[0]).toEqual(updated);

      // But getById returns the updated variant
      expect(store.getById('var-1')).toEqual(updated);
    });

    it('should add variant to environment list alongside existing variants', () => {
      const variant1 = createVariant({
        variantId: 'var-1',
        name: 'config1',
        projectId: 'proj-1',
        environmentId: 'env-1',
      });
      const variant2 = createVariant({
        variantId: 'var-2',
        name: 'config2',
        projectId: 'proj-1',
        environmentId: 'env-1',
      });

      const store = new ConfigsReplicaStore([variant1]);
      store.upsert(variant2);

      const result = store.getByEnvironment({projectId: 'proj-1', environmentId: 'env-1'});

      expect(result).toHaveLength(2);
      expect(result).toContainEqual(variant1);
      expect(result).toContainEqual(variant2);
    });
  });

  describe('delete', () => {
    it('should delete a variant by id', () => {
      const variant = createVariant({
        variantId: 'var-1',
        projectId: 'proj-1',
        environmentId: 'env-1',
      });
      const store = new ConfigsReplicaStore([variant]);

      store.delete('var-1');

      expect(store.getById('var-1')).toBeUndefined();

      const envVariants = store.getByEnvironment({projectId: 'proj-1', environmentId: 'env-1'});
      expect(envVariants).toHaveLength(0);
    });

    it('should remove variant from variantsByKey map', () => {
      const variant = createVariant({
        variantId: 'var-1',
        projectId: 'proj-1',
        name: 'config',
        environmentId: 'env-1',
      });
      const store = new ConfigsReplicaStore([variant]);

      store.delete('var-1');

      const result = store.getByVariantKey({
        projectId: 'proj-1',
        name: 'config',
        environmentId: 'env-1',
      });

      expect(result).toBeUndefined();

      const envVariants = store.getByEnvironment({projectId: 'proj-1', environmentId: 'env-1'});
      expect(envVariants).toHaveLength(0);
    });

    it('should remove variant from variantsByEnv map', () => {
      const variant = createVariant({
        variantId: 'var-1',
        projectId: 'proj-1',
        environmentId: 'env-1',
      });
      const store = new ConfigsReplicaStore([variant]);

      store.delete('var-1');

      const result = store.getByEnvironment({projectId: 'proj-1', environmentId: 'env-1'});

      expect(result).toEqual([]);
    });

    it('should not affect other variants in the same environment', () => {
      const variant1 = createVariant({
        variantId: 'var-1',
        name: 'config1',
        projectId: 'proj-1',
        environmentId: 'env-1',
      });
      const variant2 = createVariant({
        variantId: 'var-2',
        name: 'config2',
        projectId: 'proj-1',
        environmentId: 'env-1',
      });

      const store = new ConfigsReplicaStore([variant1, variant2]);
      store.delete('var-1');

      const result = store.getByEnvironment({projectId: 'proj-1', environmentId: 'env-1'});

      expect(result).toHaveLength(1);
      expect(result).toContainEqual(variant2);
    });

    it('should do nothing when deleting non-existent variant', () => {
      const variant = createVariant({
        variantId: 'var-1',
        projectId: 'proj-1',
        environmentId: 'env-1',
      });
      const store = new ConfigsReplicaStore([variant]);

      expect(() => store.delete('non-existent')).not.toThrow();
      expect(store.getById('var-1')).toEqual(variant);

      // Environment should still contain the original variant
      const envVariants = store.getByEnvironment({projectId: 'proj-1', environmentId: 'env-1'});
      expect(envVariants).toHaveLength(1);
      expect(envVariants[0]).toEqual(variant);
    });

    it('should handle deleting from empty store', () => {
      const store = new ConfigsReplicaStore();

      expect(() => store.delete('any-id')).not.toThrow();

      // Environment should still be empty
      const envVariants = store.getByEnvironment({projectId: 'any-proj', environmentId: 'any-env'});
      expect(envVariants).toHaveLength(0);
    });

    it('should allow re-adding a deleted variant', () => {
      const variant = createVariant({
        variantId: 'var-1',
        projectId: 'proj-1',
        environmentId: 'env-1',
        value: 'original',
      });
      const store = new ConfigsReplicaStore([variant]);

      store.delete('var-1');
      expect(store.getById('var-1')).toBeUndefined();

      let envVariants = store.getByEnvironment({projectId: 'proj-1', environmentId: 'env-1'});
      expect(envVariants).toHaveLength(0);

      const newVariant = createVariant({
        variantId: 'var-1',
        projectId: 'proj-1',
        environmentId: 'env-1',
        value: 'new',
      });
      store.upsert(newVariant);

      expect(store.getById('var-1')).toEqual(newVariant);

      envVariants = store.getByEnvironment({projectId: 'proj-1', environmentId: 'env-1'});
      expect(envVariants).toHaveLength(1);
      expect(envVariants[0]).toEqual(newVariant);
      expect(envVariants[0].value).toBe('new');
    });
  });

  describe('getAllVariantsById', () => {
    it('should return a copy of all variants by id', () => {
      const variant1 = createVariant({variantId: 'var-1'});
      const variant2 = createVariant({variantId: 'var-2'});

      const store = new ConfigsReplicaStore([variant1, variant2]);
      const result = store.getAllVariantsById();

      expect(result.size).toBe(2);
      expect(result.get('var-1')).toEqual(variant1);
      expect(result.get('var-2')).toEqual(variant2);
    });

    it('should return empty map for empty store', () => {
      const store = new ConfigsReplicaStore();
      const result = store.getAllVariantsById();

      expect(result.size).toBe(0);
    });

    it('should return a new Map instance (not the internal one)', () => {
      const variant = createVariant({variantId: 'var-1'});
      const store = new ConfigsReplicaStore([variant]);

      const result1 = store.getAllVariantsById();
      const result2 = store.getAllVariantsById();

      expect(result1).not.toBe(result2);
    });

    it('should not affect internal state when modifying returned map', () => {
      const variant = createVariant({variantId: 'var-1'});
      const store = new ConfigsReplicaStore([variant]);

      const result = store.getAllVariantsById();
      result.delete('var-1');
      result.set('var-2', createVariant({variantId: 'var-2'}));

      expect(store.getById('var-1')).toEqual(variant);
      expect(store.getById('var-2')).toBeUndefined();
    });

    it('should reflect current state after upsert', () => {
      const store = new ConfigsReplicaStore();

      let result = store.getAllVariantsById();
      expect(result.size).toBe(0);

      const variant = createVariant({variantId: 'var-1'});
      store.upsert(variant);

      result = store.getAllVariantsById();
      expect(result.size).toBe(1);
      expect(result.get('var-1')).toEqual(variant);
    });

    it('should reflect current state after delete', () => {
      const variant = createVariant({variantId: 'var-1'});
      const store = new ConfigsReplicaStore([variant]);

      let result = store.getAllVariantsById();
      expect(result.size).toBe(1);

      store.delete('var-1');

      result = store.getAllVariantsById();
      expect(result.size).toBe(0);
    });
  });

  describe('complex scenarios', () => {
    it('should handle multiple operations on the same variant', () => {
      const store = new ConfigsReplicaStore();

      // Insert
      const variant1 = createVariant({
        variantId: 'var-1',
        projectId: 'proj-1',
        name: 'config',
        environmentId: 'env-1',
        value: 'v1',
        version: 1,
      });
      store.upsert(variant1);

      expect(store.getById('var-1')?.value).toBe('v1');

      // Update
      const variant2 = createVariant({
        variantId: 'var-1',
        projectId: 'proj-1',
        name: 'config',
        environmentId: 'env-1',
        value: 'v2',
        version: 2,
      });
      store.upsert(variant2);

      expect(store.getById('var-1')?.value).toBe('v2');

      // Delete
      store.delete('var-1');

      expect(store.getById('var-1')).toBeUndefined();

      // Re-insert
      const variant3 = createVariant({
        variantId: 'var-1',
        projectId: 'proj-1',
        name: 'config',
        environmentId: 'env-1',
        value: 'v3',
        version: 3,
      });
      store.upsert(variant3);

      expect(store.getById('var-1')?.value).toBe('v3');
    });

    it('should maintain consistency across all access methods', () => {
      const variant = createVariant({
        variantId: 'var-123',
        projectId: 'proj-1',
        name: 'myConfig',
        environmentId: 'env-prod',
        value: {feature: 'enabled'},
      });

      const store = new ConfigsReplicaStore();
      store.upsert(variant);

      // All methods should return the same variant
      const byId = store.getById('var-123');
      const byKey = store.getByVariantKey({
        projectId: 'proj-1',
        name: 'myConfig',
        environmentId: 'env-prod',
      });
      const byEnv = store.getByEnvironment({projectId: 'proj-1', environmentId: 'env-prod'});
      const allById = store.getAllVariantsById();

      expect(byId).toEqual(variant);
      expect(byKey).toEqual(variant);
      expect(byEnv).toContainEqual(variant);
      expect(allById.get('var-123')).toEqual(variant);
    });

    it('should handle multiple projects and environments', () => {
      const variants = [
        createVariant({
          variantId: 'v1',
          projectId: 'proj-1',
          environmentId: 'env-dev',
          name: 'feature-a',
        }),
        createVariant({
          variantId: 'v2',
          projectId: 'proj-1',
          environmentId: 'env-prod',
          name: 'feature-a',
        }),
        createVariant({
          variantId: 'v3',
          projectId: 'proj-2',
          environmentId: 'env-dev',
          name: 'feature-a',
        }),
        createVariant({
          variantId: 'v4',
          projectId: 'proj-1',
          environmentId: 'env-dev',
          name: 'feature-b',
        }),
      ];

      const store = new ConfigsReplicaStore(variants);

      expect(store.getByEnvironment({projectId: 'proj-1', environmentId: 'env-dev'})).toHaveLength(
        2,
      );
      expect(store.getByEnvironment({projectId: 'proj-1', environmentId: 'env-prod'})).toHaveLength(
        1,
      );
      expect(store.getByEnvironment({projectId: 'proj-2', environmentId: 'env-dev'})).toHaveLength(
        1,
      );
      expect(store.getAllVariantsById().size).toBe(4);
    });

    it('should handle variants with complex values and overrides', () => {
      const variant = createVariant({
        variantId: 'complex-1',
        value: {
          nested: {
            data: [1, 2, 3],
            config: {enabled: true, threshold: 0.5},
          },
        },
        renderedOverrides: [
          {
            name: 'override-1',
            conditions: [
              {
                operator: 'equals',
                property: 'userId',
                value: 'user-123',
              },
            ],
            value: {override: 'value'},
          },
        ],
      });

      const store = new ConfigsReplicaStore([variant]);

      const result = store.getById('complex-1');

      expect(result?.value).toEqual(variant.value);
      expect(result?.renderedOverrides).toEqual(variant.renderedOverrides);
    });
  });
});
