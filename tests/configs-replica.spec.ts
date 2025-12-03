import type {EventBusClient} from '@/engine/core/event-bus';
import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest';
import {
  type ConfigReplicaEvent,
  ConfigsReplicaService,
} from '../src/engine/core/configs-replica-service';
import {InMemoryEventBus} from '../src/engine/core/in-memory-event-bus';
import type {Logger} from '../src/engine/core/logger';
import {createLogger} from '../src/engine/core/logger';
import type {ConfigVariantChangePayload} from '../src/engine/core/stores/config-variant-store';
import {Subject} from '../src/engine/core/subject';

function sleep(ms: number) {
  return new Promise(r => setTimeout(r, ms));
}

describe('ConfigsReplica with InMemoryListener', () => {
  let logger: Logger;

  beforeEach(() => {
    logger = createLogger({level: 'silent'});
  });

  afterEach(() => {
    // nothing
  });

  it('loads initial dump on start and updates on notify', async () => {
    const configId = 'config-1';
    const projectId = 'proj-1';
    const environmentId = 'env-1';
    const name = 'featureFlag';
    let currentValue: any = {on: false};

    const configs = {
      async getReplicaDump() {
        return [
          {
            configId,
            name,
            projectId,
            environmentId,
            value: currentValue,
            version: 1,
            overrides: [],
          },
        ];
      },
    };

    // capture the in-memory listener to emit notifications
    let mem: EventBusClient<ConfigVariantChangePayload> | null = null;

    const replica = new ConfigsReplicaService({
      pool: {} as any,
      configs: configs as any,
      logger,
      createEventBusClient: (onNotification: any) => {
        mem = new InMemoryEventBus<ConfigVariantChangePayload>({
          logger: console,
        }).createClient(onNotification);
        return mem!;
      },
    });

    await replica.start();

    // initial full refresh happens on start
    // give worker a tick to process
    await sleep(10);
    expect(replica.getConfigValue<{on: boolean}>({projectId, name, environmentId})).toEqual({
      on: false,
    });
    // simulate an update notification
    currentValue = {on: true};

    await mem!.notify({configId});
    await sleep(10);
    expect(replica.getConfigValue<{on: boolean}>({projectId, name, environmentId})).toEqual({
      on: true,
    });

    await replica.stop();
  });

  it('removes config on delete notification', async () => {
    const configId = 'config-2';
    const projectId = 'proj-1';
    const environmentId = 'env-1';
    const name = 'toDelete';
    let exists = true;

    const configs = {
      async getReplicaDump() {
        return exists
          ? [
              {
                configId,
                name,
                projectId,
                environmentId,
                value: 1,
                version: 1,
                overrides: [],
              },
            ]
          : [];
      },
    };

    let mem: EventBusClient<ConfigVariantChangePayload> | null = null;

    const replica = new ConfigsReplicaService({
      pool: {} as any,
      configs: configs as any,
      logger,

      createEventBusClient: (onNotification: any) => {
        mem = new InMemoryEventBus<ConfigVariantChangePayload>({
          logger: console,
        }).createClient(onNotification);
        return mem!;
      },
    });

    await replica.start();
    await sleep(10);
    expect(replica.getConfigValue<number>({projectId, name, environmentId})).toBe(1);

    // now delete and notify
    exists = false;
    await mem!.notify({configId});
    await sleep(10);
    expect(replica.getConfigValue<number>({projectId, name, environmentId})).toBeUndefined();

    await replica.stop();
  });

  it('processes multiple queued notifications for different ids', async () => {
    const envId = 'env-1';
    const a = {configId: 'config-a', name: 'A', projectId: 'p', environmentId: envId, version: 1};
    const b = {configId: 'config-b', name: 'B', projectId: 'p', environmentId: envId, version: 1};
    let valueA: any = 10;
    let valueB: any = 20;
    let configsExist = false;

    const configs = {
      async getReplicaDump(params?: {configId?: string}) {
        if (!configsExist) return [];
        const result = [];
        if (!params?.configId || params.configId === a.configId) {
          result.push({
            configId: a.configId,
            name: a.name,
            projectId: a.projectId,
            environmentId: a.environmentId,
            value: valueA,
            version: a.version,
            overrides: [],
          });
        }
        if (!params?.configId || params.configId === b.configId) {
          result.push({
            configId: b.configId,
            name: b.name,
            projectId: b.projectId,
            environmentId: b.environmentId,
            value: valueB,
            version: b.version,
            overrides: [],
          });
        }
        return result;
      },
    };

    let mem: EventBusClient<ConfigVariantChangePayload> | null = null;
    const replica = new ConfigsReplicaService({
      pool: {} as any,
      configs: configs as any,
      logger,

      createEventBusClient: (onNotification: any) => {
        mem = new InMemoryEventBus<ConfigVariantChangePayload>({
          logger: console,
        }).createClient(onNotification);
        return mem!;
      },
    });

    await replica.start();
    await sleep(10);
    expect(
      replica.getConfigValue<number>({
        projectId: a.projectId,
        name: a.name,
        environmentId: a.environmentId,
      }),
    ).toBeUndefined();
    expect(
      replica.getConfigValue<number>({
        projectId: b.projectId,
        name: b.name,
        environmentId: b.environmentId,
      }),
    ).toBeUndefined();

    // Enable configs and notify
    configsExist = true;
    await mem!.notify({
      configId: a.configId,
    });
    await mem!.notify({
      configId: b.configId,
    });
    await sleep(20);

    expect(
      replica.getConfigValue<number>({
        projectId: a.projectId,
        name: a.name,
        environmentId: a.environmentId,
      }),
    ).toBe(10);
    expect(
      replica.getConfigValue<number>({
        projectId: b.projectId,
        name: b.name,
        environmentId: b.environmentId,
      }),
    ).toBe(20);

    // update values and notify again
    valueA = 11;
    valueB = 22;
    await mem!.notify({
      configId: b.configId,
    });
    await mem!.notify({
      configId: a.configId,
    });
    await sleep(20);

    expect(
      replica.getConfigValue<number>({
        projectId: a.projectId,
        name: a.name,
        environmentId: a.environmentId,
      }),
    ).toBe(11);
    expect(
      replica.getConfigValue<number>({
        projectId: b.projectId,
        name: b.name,
        environmentId: b.environmentId,
      }),
    ).toBe(22);

    await replica.stop();
  });

  it('publishes events to subject on config changes', async () => {
    const configId = 'config-events';
    const projectId = 'proj-events';
    const environmentId = 'env-events';
    const name = 'eventsConfig';
    let currentValue: any = {enabled: false};
    let currentVersion = 1;
    let exists = true;

    const configs = {
      async getReplicaDump(params?: {configId?: string}) {
        if (!exists) return [];
        return [
          {
            configId,
            name,
            projectId,
            environmentId,
            value: currentValue,
            version: currentVersion,
            overrides: [],
          },
        ];
      },
    };

    let mem: EventBusClient<ConfigVariantChangePayload> | null = null;
    const eventsSubject = new Subject<ConfigReplicaEvent>();
    const eventsSpy = vi.fn();

    eventsSubject.subscribe({
      next: eventsSpy,
      error: vi.fn(),
      complete: vi.fn(),
    });

    const replica = new ConfigsReplicaService({
      pool: {} as any,
      configs: configs as any,
      logger,
      eventsSubject,

      createEventBusClient: (onNotification: any) => {
        mem = new InMemoryEventBus<ConfigVariantChangePayload>({
          logger: console,
        }).createClient(onNotification);
        return mem!;
      },
    });

    await replica.start();
    await sleep(10);

    // Notify about new config - should trigger 'created' event
    await mem!.notify({configId});
    await sleep(10);

    expect(eventsSpy).toHaveBeenCalledTimes(1);
    expect(eventsSpy).toHaveBeenCalledWith({
      type: 'created',
      variant: {
        configId,
        name,
        projectId,
        environmentId,
        value: {enabled: false},
        version: 1,
        renderedOverrides: [],
      },
    });

    // Update config - should trigger 'updated' event
    currentValue = {enabled: true};
    currentVersion = 2;
    await mem!.notify({configId});
    await sleep(10);

    expect(eventsSpy).toHaveBeenCalledTimes(2);
    expect(eventsSpy).toHaveBeenCalledWith({
      type: 'updated',
      variant: {
        configId,
        name,
        projectId,
        environmentId,
        value: {enabled: true},
        version: 2,
        renderedOverrides: [],
      },
    });

    // Delete config - should trigger 'deleted' event
    exists = false;
    await mem!.notify({configId});
    await sleep(10);

    expect(eventsSpy).toHaveBeenCalledTimes(3);
    expect(eventsSpy).toHaveBeenCalledWith({
      type: 'deleted',
      variant: {
        configId,
        name,
        projectId,
        environmentId,
        value: {enabled: true},
        version: 2,
        renderedOverrides: [],
      },
    });

    await replica.stop();
  });

  it('does not publish events when subject is not provided', async () => {
    const configId = 'config-no-subject';
    const projectId = 'proj-no-subject';
    const environmentId = 'env-no-subject';
    const name = 'noSubjectConfig';

    const configs = {
      async getReplicaDump(params?: {configId?: string}) {
        return [
          {
            configId,
            name,
            projectId,
            environmentId,
            value: 1,
            version: 1,
            overrides: [],
          },
        ];
      },
    };

    let mem: EventBusClient<ConfigVariantChangePayload> | null = null;

    const replica = new ConfigsReplicaService({
      pool: {} as any,
      configs: configs as any,
      logger,
      // No eventsSubject provided

      createEventBusClient: (onNotification: any) => {
        mem = new InMemoryEventBus<ConfigVariantChangePayload>({
          logger: console,
        }).createClient(onNotification);
        return mem!;
      },
    });

    await replica.start();
    await sleep(10);

    // Should not throw even without subject
    await mem!.notify({configId});
    await sleep(10);

    expect(replica.getConfigValue<number>({projectId, name, environmentId})).toBe(1);

    await replica.stop();
  });

  it('publishes created events during initial full refresh', async () => {
    const envId = 'env-1';
    const config1 = {
      variant_id: 'var-1',
      name: 'config1',
      projectId: 'proj',
      environmentId: envId,
      version: 1,
      value: 'v1',
      overrides: [],
    };
    const config2 = {
      variant_id: 'var-2',
      name: 'config2',
      projectId: 'proj',
      environmentId: envId,
      version: 1,
      value: 'v2',
      overrides: [],
    };

    const configs = {
      async getReplicaDump() {
        return [config1, config2];
      },
      async getReplicaConfig(vId: string) {
        return null;
      },
    };

    let mem: EventBusClient<ConfigVariantChangePayload> | null = null;
    const eventsSubject = new Subject<ConfigReplicaEvent>();
    const eventsSpy = vi.fn();

    eventsSubject.subscribe({
      next: eventsSpy,
      error: vi.fn(),
      complete: vi.fn(),
    });

    const replica = new ConfigsReplicaService({
      pool: {} as any,
      configs: configs as any,
      logger,
      eventsSubject,

      createEventBusClient: (onNotification: any) => {
        mem = new InMemoryEventBus<ConfigVariantChangePayload>({
          logger: console,
        }).createClient(onNotification);
        return mem!;
      },
    });

    await replica.start();
    await sleep(10);

    // Initial full refresh should trigger 2 'created' events
    expect(eventsSpy).toHaveBeenCalledTimes(2);
    expect(eventsSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        type: 'created',
        variant: expect.objectContaining({
          name: config1.name,
          projectId: config1.projectId,
          environmentId: config1.environmentId,
          value: config1.value,
          version: config1.version,
          renderedOverrides: [],
        }),
      }),
    );
    expect(eventsSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        type: 'created',
        variant: expect.objectContaining({
          name: config2.name,
          projectId: config2.projectId,
          environmentId: config2.environmentId,
          value: config2.value,
          version: config2.version,
          renderedOverrides: [],
        }),
      }),
    );

    await replica.stop();
  });

  describe('getEnvironmentConfigs', () => {
    it('returns all configs for a given environment', async () => {
      const projectId = 'proj-1';
      const environmentId = 'env-prod';

      const configs = {
        async getReplicaDump() {
          return [
            {
              variant_id: 'var-1',
              name: 'featureA',
              projectId,
              environmentId,
              value: true,
              version: 1,
              overrides: [],
            },
            {
              variant_id: 'var-2',
              name: 'featureB',
              projectId,
              environmentId,
              value: false,
              version: 1,
              overrides: [],
            },
            {
              variant_id: 'var-3',
              name: 'featureC',
              projectId,
              environmentId,
              value: {setting: 'value'},
              version: 1,
              overrides: [],
            },
          ];
        },
        async getReplicaConfig() {
          return null;
        },
      };

      let mem: EventBusClient<ConfigVariantChangePayload> | null = null;
      const replica = new ConfigsReplicaService({
        pool: {} as any,
        configs: configs as any,
        logger,
        createEventBusClient: (onNotification: any) => {
          mem = new InMemoryEventBus<ConfigVariantChangePayload>({
            logger: console,
          }).createClient(onNotification);
          return mem!;
        },
      });

      await replica.start();
      await sleep(10);

      const envConfigs = replica.getEnvironmentConfigs({projectId, environmentId});

      expect(envConfigs).toHaveLength(3);
      expect(envConfigs.map(c => c.name)).toEqual(['featureA', 'featureB', 'featureC']);
      expect(envConfigs[0]).toMatchObject({
        name: 'featureA',
        projectId,
        environmentId,
        value: true,
        version: 1,
      });

      await replica.stop();
    });

    it('returns empty array when no configs exist for environment', async () => {
      const configs = {
        async getReplicaDump() {
          return [
            {
              variant_id: 'var-1',
              name: 'feature',
              projectId: 'proj-1',
              environmentId: 'env-dev',
              value: 1,
              version: 1,
              overrides: [],
            },
          ];
        },
        async getReplicaConfig() {
          return null;
        },
      };

      let mem: EventBusClient<ConfigVariantChangePayload> | null = null;
      const replica = new ConfigsReplicaService({
        pool: {} as any,
        configs: configs as any,
        logger,
        createEventBusClient: (onNotification: any) => {
          mem = new InMemoryEventBus<ConfigVariantChangePayload>({
            logger: console,
          }).createClient(onNotification);
          return mem!;
        },
      });

      await replica.start();
      await sleep(10);

      // Query different environment
      const envConfigs = replica.getEnvironmentConfigs({
        projectId: 'proj-1',
        environmentId: 'env-prod',
      });

      expect(envConfigs).toEqual([]);

      await replica.stop();
    });

    it('isolates configs by project', async () => {
      const configs = {
        async getReplicaDump() {
          return [
            {
              variant_id: 'var-1',
              name: 'feature',
              projectId: 'proj-1',
              environmentId: 'env-1',
              value: 'project1',
              version: 1,
              overrides: [],
            },
            {
              variant_id: 'var-2',
              name: 'feature',
              projectId: 'proj-2',
              environmentId: 'env-1',
              value: 'project2',
              version: 1,
              overrides: [],
            },
          ];
        },
        async getReplicaConfig() {
          return null;
        },
      };

      let mem: EventBusClient<ConfigVariantChangePayload> | null = null;
      const replica = new ConfigsReplicaService({
        pool: {} as any,
        configs: configs as any,
        logger,
        createEventBusClient: (onNotification: any) => {
          mem = new InMemoryEventBus<ConfigVariantChangePayload>({
            logger: console,
          }).createClient(onNotification);
          return mem!;
        },
      });

      await replica.start();
      await sleep(10);

      const proj1Configs = replica.getEnvironmentConfigs({
        projectId: 'proj-1',
        environmentId: 'env-1',
      });
      const proj2Configs = replica.getEnvironmentConfigs({
        projectId: 'proj-2',
        environmentId: 'env-1',
      });

      expect(proj1Configs).toHaveLength(1);
      expect(proj1Configs[0].value).toBe('project1');

      expect(proj2Configs).toHaveLength(1);
      expect(proj2Configs[0].value).toBe('project2');

      await replica.stop();
    });

    it('updates environment configs when configs are added', async () => {
      const projectId = 'proj-1';
      const environmentId = 'env-1';
      let includeNew = false;

      const configs = {
        async getReplicaDump(params?: {configId?: string}) {
          const result = [];
          result.push({
            configId: 'config-1',
            name: 'existing',
            projectId,
            environmentId,
            value: 'initial',
            version: 1,
            overrides: [],
          });
          if (includeNew) {
            result.push({
              configId: 'config-2',
              name: 'new',
              projectId,
              environmentId,
              value: 'added',
              version: 1,
              overrides: [],
            });
          }
          return result;
        },
      };

      let mem: EventBusClient<ConfigVariantChangePayload> | null = null;
      const replica = new ConfigsReplicaService({
        pool: {} as any,
        configs: configs as any,
        logger,
        createEventBusClient: (onNotification: any) => {
          mem = new InMemoryEventBus<ConfigVariantChangePayload>({
            logger: console,
          }).createClient(onNotification);
          return mem!;
        },
      });

      await replica.start();
      await sleep(10);

      let envConfigs = replica.getEnvironmentConfigs({projectId, environmentId});
      expect(envConfigs).toHaveLength(1);
      expect(envConfigs[0].name).toBe('existing');

      // Add new config
      includeNew = true;
      await mem!.notify({
        configId: 'config-2',
      });
      await sleep(10);

      envConfigs = replica.getEnvironmentConfigs({projectId, environmentId});
      expect(envConfigs).toHaveLength(2);
      expect(envConfigs.map(c => c.name).sort()).toEqual(['existing', 'new']);

      await replica.stop();
    });

    it('updates environment configs when configs are removed', async () => {
      const projectId = 'proj-1';
      const environmentId = 'env-1';
      let configExists = true;

      const configs = {
        async getReplicaDump(params?: {configId?: string}) {
          const allConfigs = [
            {
              configId: 'config-1',
              name: 'toKeep',
              projectId,
              environmentId,
              value: 'keep',
              version: 1,
              overrides: [],
            },
          ];
          if (configExists) {
            allConfigs.push({
              configId: 'config-2',
              name: 'toRemove',
              projectId,
              environmentId,
              value: 'remove',
              version: 1,
              overrides: [],
            });
          }
          // Filter by configId if specified
          if (params?.configId) {
            return allConfigs.filter(c => c.configId === params.configId);
          }
          return allConfigs;
        },
      };

      let mem: EventBusClient<ConfigVariantChangePayload> | null = null;
      const replica = new ConfigsReplicaService({
        pool: {} as any,
        configs: configs as any,
        logger,
        createEventBusClient: (onNotification: any) => {
          mem = new InMemoryEventBus<ConfigVariantChangePayload>({
            logger: console,
          }).createClient(onNotification);
          return mem!;
        },
      });

      await replica.start();
      await sleep(10);

      let envConfigs = replica.getEnvironmentConfigs({projectId, environmentId});
      expect(envConfigs).toHaveLength(2);
      expect(envConfigs.map(c => c.name).sort()).toEqual(['toKeep', 'toRemove']);

      // Remove config
      configExists = false;
      await mem!.notify({
        configId: 'config-2',
      });
      await sleep(10);

      envConfigs = replica.getEnvironmentConfigs({projectId, environmentId});
      expect(envConfigs).toHaveLength(1);
      expect(envConfigs[0].name).toBe('toKeep');

      await replica.stop();
    });

    it('returns configs with rendered overrides', async () => {
      const projectId = 'proj-1';
      const environmentId = 'env-1';

      const configs = {
        async getReplicaDump() {
          return [
            {
              variant_id: 'var-1',
              name: 'configWithOverrides',
              projectId,
              environmentId,
              value: 'base',
              version: 1,
              overrides: [
                {
                  name: 'override-1',
                  value: 'override-value',
                  conditions: [
                    {
                      operator: 'equals' as const,
                      property: 'userId',
                      value: {type: 'literal' as const, value: '123'},
                    },
                  ],
                },
              ],
            },
          ];
        },
        async getReplicaConfig() {
          return null;
        },
      };

      let mem: EventBusClient<ConfigVariantChangePayload> | null = null;
      const replica = new ConfigsReplicaService({
        pool: {} as any,
        configs: configs as any,
        logger,
        createEventBusClient: (onNotification: any) => {
          mem = new InMemoryEventBus<ConfigVariantChangePayload>({
            logger: console,
          }).createClient(onNotification);
          return mem!;
        },
      });

      await replica.start();
      await sleep(10);

      const envConfigs = replica.getEnvironmentConfigs({projectId, environmentId});

      expect(envConfigs).toHaveLength(1);
      expect(envConfigs[0].renderedOverrides).toHaveLength(1);
      expect(envConfigs[0].renderedOverrides[0]).toMatchObject({
        name: 'override-1',
        value: 'override-value',
        conditions: [
          {
            operator: 'equals',
            property: 'userId',
            value: '123',
          },
        ],
      });

      await replica.stop();
    });

    it('handles multiple environments for same project', async () => {
      const projectId = 'proj-1';

      const configs = {
        async getReplicaDump() {
          return [
            {
              variant_id: 'var-dev',
              name: 'feature',
              projectId,
              environmentId: 'env-dev',
              value: 'dev-value',
              version: 1,
              overrides: [],
            },
            {
              variant_id: 'var-staging',
              name: 'feature',
              projectId,
              environmentId: 'env-staging',
              value: 'staging-value',
              version: 1,
              overrides: [],
            },
            {
              variant_id: 'var-prod',
              name: 'feature',
              projectId,
              environmentId: 'env-prod',
              value: 'prod-value',
              version: 1,
              overrides: [],
            },
          ];
        },
        async getReplicaConfig() {
          return null;
        },
      };

      let mem: EventBusClient<ConfigVariantChangePayload> | null = null;
      const replica = new ConfigsReplicaService({
        pool: {} as any,
        configs: configs as any,
        logger,
        createEventBusClient: (onNotification: any) => {
          mem = new InMemoryEventBus<ConfigVariantChangePayload>({
            logger: console,
          }).createClient(onNotification);
          return mem!;
        },
      });

      await replica.start();
      await sleep(10);

      const devConfigs = replica.getEnvironmentConfigs({projectId, environmentId: 'env-dev'});
      const stagingConfigs = replica.getEnvironmentConfigs({
        projectId,
        environmentId: 'env-staging',
      });
      const prodConfigs = replica.getEnvironmentConfigs({projectId, environmentId: 'env-prod'});

      expect(devConfigs).toHaveLength(1);
      expect(devConfigs[0].value).toBe('dev-value');

      expect(stagingConfigs).toHaveLength(1);
      expect(stagingConfigs[0].value).toBe('staging-value');

      expect(prodConfigs).toHaveLength(1);
      expect(prodConfigs[0].value).toBe('prod-value');

      await replica.stop();
    });
  });
});
