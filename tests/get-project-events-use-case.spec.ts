import {GLOBAL_CONTEXT} from '@/engine/core/context';
import type {Override} from '@/engine/core/override-condition-schemas';
import type {ProjectEvent} from '@/engine/core/use-cases/get-project-events-use-case';
import {normalizeEmail, wait} from '@/engine/core/utils';
import {asConfigSchema, asConfigValue} from '@/engine/core/zod';
import {describe, expect, it} from 'vitest';
import {emailToIdentity, useAppFixture} from './fixtures/app-fixture';

/**
 * Integration tests for createGetProjectEventsUseCase
 *
 * This use case:
 * - Subscribes to real replica events from the edge
 * - Transforms ReplicaEvent to ProjectEvent (config_created, config_updated, config_deleted)
 * - Emits events for configs affected by references when a referenced config changes
 * - Handles cleanup on abort signal
 */

const CURRENT_USER_EMAIL = normalizeEmail('test@example.com');

async function collectEvents(
  iterable: AsyncIterable<ProjectEvent>,
  maxEvents: number,
  timeoutMs: number = 2000,
): Promise<ProjectEvent[]> {
  const events: ProjectEvent[] = [];
  const iterator = iterable[Symbol.asyncIterator]();
  const startTime = Date.now();

  while (events.length < maxEvents) {
    const elapsed = Date.now() - startTime;
    if (elapsed >= timeoutMs) break;

    const remainingTime = timeoutMs - elapsed;

    const result = await Promise.race([
      iterator.next(),
      new Promise<{done: true; value: undefined}>(resolve =>
        setTimeout(() => resolve({done: true, value: undefined}), remainingTime),
      ),
    ]);

    if (result.done) break;
    events.push(result.value);
  }

  return events;
}

describe('getProjectEvents', () => {
  const fixture = useAppFixture({authEmail: CURRENT_USER_EMAIL});

  describe('config creation events', () => {
    it('should emit config_created event when a new config is created', async () => {
      const abortController = new AbortController();

      // Start listening for events before creating config
      const eventsPromise = collectEvents(
        fixture.edge.useCases.getProjectEvents(GLOBAL_CONTEXT, {
          projectId: fixture.projectId,
          environmentId: fixture.productionEnvironmentId,
          abortSignal: abortController.signal,
        }),
        1,
      );

      // Sync replica to ensure it's ready
      await fixture.syncReplica();

      // Wait for subscription to be established
      await new Promise(resolve => setTimeout(resolve, 50));

      // Create a config
      await fixture.createConfig({
        name: 'feature-flag',
        value: {enabled: true},
        schema: {type: 'object', properties: {enabled: {type: 'boolean'}}},
        overrides: [],
        description: 'A feature flag',
        identity: emailToIdentity(CURRENT_USER_EMAIL),
        editorEmails: [],
        maintainerEmails: [],
        projectId: fixture.projectId,
      });

      // Sync replica to propagate the event
      await fixture.syncReplica();

      const events = await eventsPromise;
      abortController.abort();

      expect(events).toHaveLength(1);
      expect(events[0].type).toBe('config_created');
      expect(events[0].configName).toBe('feature-flag');
      expect(events[0].version).toBe(1);
      expect(events[0].value).toEqual({enabled: true});
    });
  });

  describe('config update events', () => {
    it('should emit config_updated event when a config is updated', async () => {
      // First create a config
      const {configId} = await fixture.createConfig({
        name: 'update-test-config',
        value: {count: 1},
        schema: {type: 'object', properties: {count: {type: 'number'}}},
        overrides: [],
        description: 'Config for update testing',
        identity: emailToIdentity(CURRENT_USER_EMAIL),
        editorEmails: [],
        maintainerEmails: [],
        projectId: fixture.projectId,
      });

      // Sync to ensure config is in replica
      await fixture.syncReplica();

      const abortController = new AbortController();

      // Start listening for events
      const eventsPromise = collectEvents(
        fixture.edge.useCases.getProjectEvents(GLOBAL_CONTEXT, {
          projectId: fixture.projectId,
          environmentId: fixture.productionEnvironmentId,
          abortSignal: abortController.signal,
        }),
        1,
      );

      await wait(50);

      // Update the config
      await fixture.engine.useCases.updateConfig(GLOBAL_CONTEXT, {
        projectId: fixture.projectId,
        configName: 'update-test-config',
        identity: emailToIdentity(CURRENT_USER_EMAIL),
        description: 'Updated description',
        editors: [],
        maintainers: [],
        prevVersion: 1,
        base: {
          value: asConfigValue({count: 2}),
          schema: asConfigSchema({type: 'object', properties: {count: {type: 'number'}}}),
          overrides: [],
        },
        environments: fixture.environments.map(env => ({
          environmentId: env.id,
          value: asConfigValue({count: 2}),
          schema: asConfigSchema({type: 'object', properties: {count: {type: 'number'}}}),
          overrides: [],
          useBaseSchema: false,
        })),
      });

      await fixture.syncReplica();

      const events = await eventsPromise;
      abortController.abort();

      expect(events).toHaveLength(1);
      expect(events[0].type).toBe('config_updated');
      expect(events[0].configName).toBe('update-test-config');
      expect(events[0].version).toBe(2);
      expect(events[0].value).toEqual({count: 2});
    });
  });

  describe('config deletion events', () => {
    it('should emit config_deleted event when a config is deleted', async () => {
      // First create a config
      const {configId} = await fixture.createConfig({
        name: 'delete-test-config',
        value: {data: 'test'},
        schema: {type: 'object', properties: {data: {type: 'string'}}},
        overrides: [],
        description: 'Config for delete testing',
        identity: emailToIdentity(CURRENT_USER_EMAIL),
        editorEmails: [],
        maintainerEmails: [],
        projectId: fixture.projectId,
      });

      // Sync to ensure config is in replica
      await fixture.syncReplica();

      const abortController = new AbortController();

      // Start listening for events
      const eventsPromise = collectEvents(
        fixture.edge.useCases.getProjectEvents(GLOBAL_CONTEXT, {
          projectId: fixture.projectId,
          environmentId: fixture.productionEnvironmentId,
          abortSignal: abortController.signal,
        }),
        1,
      );

      await wait(50);

      // Delete the config
      await fixture.engine.useCases.deleteConfig(GLOBAL_CONTEXT, {
        projectId: fixture.projectId,
        configName: 'delete-test-config',
        identity: emailToIdentity(CURRENT_USER_EMAIL),
        prevVersion: 1,
      });

      await fixture.syncReplica();

      const events = await eventsPromise;
      abortController.abort();

      expect(events).toHaveLength(1);
      expect(events[0].type).toBe('config_deleted');
      expect(events[0].configName).toBe('delete-test-config');
    });
  });

  describe('environment-specific values', () => {
    it('should return environment-specific variant value in events', async () => {
      const abortController = new AbortController();

      // Start listening for production environment events
      const eventsPromise = collectEvents(
        fixture.edge.useCases.getProjectEvents(GLOBAL_CONTEXT, {
          projectId: fixture.projectId,
          environmentId: fixture.productionEnvironmentId,
          abortSignal: abortController.signal,
        }),
        1,
      );

      await fixture.syncReplica();
      await wait(50);

      // Create a config with different values per environment
      const {environments} = await fixture.engine.useCases.getProjectEnvironments(GLOBAL_CONTEXT, {
        projectId: fixture.projectId,
        identity: emailToIdentity(CURRENT_USER_EMAIL),
      });

      await fixture.engine.useCases.createConfig(GLOBAL_CONTEXT, {
        name: 'env-specific-config',
        description: 'Config with environment-specific values',
        identity: emailToIdentity(CURRENT_USER_EMAIL),
        editorEmails: [],
        maintainerEmails: [],
        projectId: fixture.projectId,
        defaultVariant: {
          value: asConfigValue({mode: 'default'}),
          schema: asConfigSchema({type: 'object', properties: {mode: {type: 'string'}}}),
          overrides: [],
        },
        environmentVariants: environments.map(env => ({
          environmentId: env.id,
          value: asConfigValue({mode: env.name === 'Production' ? 'production' : 'development'}),
          schema: asConfigSchema({type: 'object', properties: {mode: {type: 'string'}}}),
          overrides: [],
          useBaseSchema: false,
        })),
      });

      await fixture.syncReplica();

      const events = await eventsPromise;
      abortController.abort();

      expect(events).toHaveLength(1);
      expect(events[0].type).toBe('config_created');
      expect(events[0].configName).toBe('env-specific-config');
      // Should get the production-specific value
      expect(events[0].value).toEqual({mode: 'production'});
    });
  });

  describe('project isolation', () => {
    it('should only receive events for the subscribed project', async () => {
      // Create a second project
      const {projectId: secondProjectId} = await fixture.engine.useCases.createProject(
        GLOBAL_CONTEXT,
        {
          identity: emailToIdentity(CURRENT_USER_EMAIL),
          workspaceId: fixture.workspaceId,
          name: 'Second Project',
          description: 'Another project for isolation testing',
        },
      );

      const abortController = new AbortController();

      // Listen only to the first project
      const eventsPromise = collectEvents(
        fixture.edge.useCases.getProjectEvents(GLOBAL_CONTEXT, {
          projectId: fixture.projectId,
          environmentId: fixture.productionEnvironmentId,
          abortSignal: abortController.signal,
        }),
        1,
      );

      await fixture.syncReplica();
      await wait(50);

      // Create config in the second project (should not trigger event)
      const {environments: secondProjectEnvs} =
        await fixture.engine.useCases.getProjectEnvironments(GLOBAL_CONTEXT, {
          projectId: secondProjectId,
          identity: emailToIdentity(CURRENT_USER_EMAIL),
        });

      await fixture.engine.useCases.createConfig(GLOBAL_CONTEXT, {
        name: 'other-project-config',
        description: 'Config in second project',
        identity: emailToIdentity(CURRENT_USER_EMAIL),
        editorEmails: [],
        maintainerEmails: [],
        projectId: secondProjectId,
        defaultVariant: {
          value: asConfigValue({other: true}),
          schema: null,
          overrides: [],
        },
        environmentVariants: secondProjectEnvs.map(env => ({
          environmentId: env.id,
          value: asConfigValue({other: true}),
          schema: null,
          overrides: [],
          useBaseSchema: false,
        })),
      });

      await fixture.syncReplica();

      // Create config in the first project (should trigger event)
      await fixture.createConfig({
        name: 'first-project-config',
        value: {first: true},
        schema: null,
        overrides: [],
        description: 'Config in first project',
        identity: emailToIdentity(CURRENT_USER_EMAIL),
        editorEmails: [],
        maintainerEmails: [],
        projectId: fixture.projectId,
      });

      await fixture.syncReplica();

      const events = await eventsPromise;
      abortController.abort();

      // Should only receive the event from the first project
      expect(events).toHaveLength(1);
      expect(events[0].configName).toBe('first-project-config');
    });
  });

  describe('multiple events', () => {
    it('should handle a sequence of different event types', async () => {
      const abortController = new AbortController();

      const eventsPromise = collectEvents(
        fixture.edge.useCases.getProjectEvents(GLOBAL_CONTEXT, {
          projectId: fixture.projectId,
          environmentId: fixture.productionEnvironmentId,
          abortSignal: abortController.signal,
        }),
        3,
        5000, // Longer timeout for multiple operations
      );

      await fixture.syncReplica();
      await wait(50);

      // Create a config
      const {configId} = await fixture.createConfig({
        name: 'lifecycle-config',
        value: {version: 1},
        schema: {type: 'object', properties: {version: {type: 'number'}}},
        overrides: [],
        description: 'Config for lifecycle testing',
        identity: emailToIdentity(CURRENT_USER_EMAIL),
        editorEmails: [],
        maintainerEmails: [],
        projectId: fixture.projectId,
      });
      await fixture.syncReplica();

      // Update the config
      await fixture.engine.useCases.updateConfig(GLOBAL_CONTEXT, {
        projectId: fixture.projectId,
        configName: 'lifecycle-config',
        identity: emailToIdentity(CURRENT_USER_EMAIL),
        description: 'Updated lifecycle config',
        editors: [],
        maintainers: [],
        prevVersion: 1,
        base: {
          value: asConfigValue({version: 2}),
          schema: asConfigSchema({type: 'object', properties: {version: {type: 'number'}}}),
          overrides: [],
        },
        environments: fixture.environments.map(env => ({
          environmentId: env.id,
          value: asConfigValue({version: 2}),
          schema: asConfigSchema({type: 'object', properties: {version: {type: 'number'}}}),
          overrides: [],
          useBaseSchema: false,
        })),
      });
      await fixture.syncReplica();

      // Delete the config
      await fixture.engine.useCases.deleteConfig(GLOBAL_CONTEXT, {
        projectId: fixture.projectId,
        configName: 'lifecycle-config',
        identity: emailToIdentity(CURRENT_USER_EMAIL),
        prevVersion: 2,
      });
      await fixture.syncReplica();

      const events = await eventsPromise;
      abortController.abort();

      expect(events.length).toBeGreaterThanOrEqual(3);

      // Find events by type
      const createEvent = events.find(e => e.type === 'config_created');
      const updateEvent = events.find(e => e.type === 'config_updated');
      const deleteEvent = events.find(e => e.type === 'config_deleted');

      expect(createEvent).toBeDefined();
      expect(createEvent?.configName).toBe('lifecycle-config');
      expect(createEvent?.value).toEqual({version: 1});

      expect(updateEvent).toBeDefined();
      expect(updateEvent?.configName).toBe('lifecycle-config');
      expect(updateEvent?.value).toEqual({version: 2});

      expect(deleteEvent).toBeDefined();
      expect(deleteEvent?.configName).toBe('lifecycle-config');
    });
  });

  describe('abort signal handling', () => {
    it('should stop iteration when abort signal is triggered', async () => {
      const abortController = new AbortController();

      const receivedEvents: ProjectEvent[] = [];
      let iterationComplete = false;

      const iterationPromise = (async () => {
        for await (const event of fixture.edge.useCases.getProjectEvents(GLOBAL_CONTEXT, {
          projectId: fixture.projectId,
          environmentId: fixture.productionEnvironmentId,
          abortSignal: abortController.signal,
        })) {
          receivedEvents.push(event);
        }
        iterationComplete = true;
      })();

      await fixture.syncReplica();
      await new Promise(resolve => setTimeout(resolve, 50));

      // Create a config
      await fixture.createConfig({
        name: 'abort-test-config',
        value: {test: true},
        schema: null,
        overrides: [],
        description: 'Config for abort testing',
        identity: emailToIdentity(CURRENT_USER_EMAIL),
        editorEmails: [],
        maintainerEmails: [],
        projectId: fixture.projectId,
      });
      await fixture.syncReplica();

      // Wait for event to be received
      await new Promise(resolve => setTimeout(resolve, 100));

      expect(receivedEvents.length).toBeGreaterThanOrEqual(1);
      expect(iterationComplete).toBe(false);

      // Abort the signal
      abortController.abort();

      // Wait for iteration to complete
      await iterationPromise;

      expect(iterationComplete).toBe(true);
    });
  });

  describe('overrides handling', () => {
    it('should include rendered overrides in events', async () => {
      const abortController = new AbortController();

      const eventsPromise = collectEvents(
        fixture.edge.useCases.getProjectEvents(GLOBAL_CONTEXT, {
          projectId: fixture.projectId,
          environmentId: fixture.productionEnvironmentId,
          abortSignal: abortController.signal,
        }),
        1,
      );

      await fixture.syncReplica();
      await new Promise(resolve => setTimeout(resolve, 50));

      // Create a config with overrides
      const {environments} = await fixture.engine.useCases.getProjectEnvironments(GLOBAL_CONTEXT, {
        projectId: fixture.projectId,
        identity: emailToIdentity(CURRENT_USER_EMAIL),
      });

      const overrides = [
        {
          name: 'beta-users',
          conditions: [
            {
              operator: 'equals' as const,
              property: 'isBetaUser',
              value: {type: 'literal' as const, value: asConfigValue(true)},
            },
          ],
          value: asConfigValue({feature: 'beta-version'}),
        },
      ];

      await fixture.engine.useCases.createConfig(GLOBAL_CONTEXT, {
        name: 'config-with-overrides',
        description: 'Config with conditional overrides',
        identity: emailToIdentity(CURRENT_USER_EMAIL),
        editorEmails: [],
        maintainerEmails: [],
        projectId: fixture.projectId,
        defaultVariant: {
          value: asConfigValue({feature: 'default'}),
          schema: asConfigSchema({type: 'object', properties: {feature: {type: 'string'}}}),
          overrides: overrides,
        },
        environmentVariants: environments.map(env => ({
          environmentId: env.id,
          value: asConfigValue({feature: 'default'}),
          schema: asConfigSchema({type: 'object', properties: {feature: {type: 'string'}}}),
          overrides: overrides,
          useBaseSchema: false,
        })),
      });

      await fixture.syncReplica();

      const events = await eventsPromise;
      abortController.abort();

      expect(events).toHaveLength(1);
      expect(events[0].type).toBe('config_created');
      expect(events[0].overrides).toHaveLength(1);
      expect(events[0].overrides[0].name).toBe('beta-users');
      expect(events[0].overrides[0].value).toEqual({feature: 'beta-version'});
    });
  });

  describe('cleanup', () => {
    it('should cleanly handle cleanup when iteration completes', async () => {
      const abortController = new AbortController();

      const receivedEvents: ProjectEvent[] = [];
      let iterationComplete = false;

      const iterationPromise = (async () => {
        for await (const event of fixture.edge.useCases.getProjectEvents(GLOBAL_CONTEXT, {
          projectId: fixture.projectId,
          environmentId: fixture.productionEnvironmentId,
          abortSignal: abortController.signal,
        })) {
          receivedEvents.push(event);
        }
        iterationComplete = true;
      })();

      await fixture.syncReplica();
      await new Promise(resolve => setTimeout(resolve, 50));

      // Abort to trigger cleanup
      abortController.abort();

      // Wait for iteration to complete
      await iterationPromise;

      expect(iterationComplete).toBe(true);

      // Creating more configs after cleanup should not cause issues
      await fixture.createConfig({
        name: 'after-cleanup-config',
        value: {cleanup: true},
        schema: null,
        overrides: [],
        description: 'Config created after cleanup',
        identity: emailToIdentity(CURRENT_USER_EMAIL),
        editorEmails: [],
        maintainerEmails: [],
        projectId: fixture.projectId,
      });
      await fixture.syncReplica();

      // Give it a moment to ensure no errors
      await new Promise(resolve => setTimeout(resolve, 50));

      // Events after abort should not be received
      expect(receivedEvents).toHaveLength(0);
    });
  });

  describe('config references', () => {
    it('should emit update event for referencing config when referenced config is updated', async () => {
      // First, create the base config that will be referenced
      await fixture.createConfig({
        name: 'base-config',
        value: {threshold: 100},
        schema: {type: 'object', properties: {threshold: {type: 'number'}}},
        overrides: [],
        description: 'Base config to be referenced',
        identity: emailToIdentity(CURRENT_USER_EMAIL),
        editorEmails: [],
        maintainerEmails: [],
        projectId: fixture.projectId,
      });

      // Create a config that references the base config via an override condition
      const {environments} = await fixture.engine.useCases.getProjectEnvironments(GLOBAL_CONTEXT, {
        projectId: fixture.projectId,
        identity: emailToIdentity(CURRENT_USER_EMAIL),
      });

      const referencingOverrides: Override[] = [
        {
          name: 'threshold-based-override',
          conditions: [
            {
              operator: 'greater_than' as const,
              property: 'score',
              value: {
                type: 'reference' as const,
                projectId: fixture.projectId,
                configName: 'base-config',
                path: ['threshold'],
              },
            },
          ],
          value: asConfigValue({tier: 'premium'}),
        },
      ];

      await fixture.engine.useCases.createConfig(GLOBAL_CONTEXT, {
        name: 'referencing-config',
        description: 'Config that references base-config',
        identity: emailToIdentity(CURRENT_USER_EMAIL),
        editorEmails: [],
        maintainerEmails: [],
        projectId: fixture.projectId,
        defaultVariant: {
          value: asConfigValue({tier: 'basic'}),
          schema: asConfigSchema({type: 'object', properties: {tier: {type: 'string'}}}),
          overrides: referencingOverrides,
        },
        environmentVariants: environments.map(env => ({
          environmentId: env.id,
          value: asConfigValue({tier: 'basic'}),
          schema: asConfigSchema({type: 'object', properties: {tier: {type: 'string'}}}),
          overrides: referencingOverrides,
          useBaseSchema: false,
        })),
      });

      // Sync replica to ensure both configs are in the replica
      await fixture.syncReplica();

      const abortController = new AbortController();

      // Start listening for events
      const eventsPromise = collectEvents(
        fixture.edge.useCases.getProjectEvents(GLOBAL_CONTEXT, {
          projectId: fixture.projectId,
          environmentId: fixture.productionEnvironmentId,
          abortSignal: abortController.signal,
        }),
        2, // Expect 2 events: base-config update + referencing-config update
        3000,
      );

      await wait(50);

      // Get the base config to find its ID
      const {config: baseConfigDetails} = await fixture.trpc.getConfig({
        name: 'base-config',
        projectId: fixture.projectId,
      });

      // Update the base config
      await fixture.engine.useCases.updateConfig(GLOBAL_CONTEXT, {
        projectId: fixture.projectId,
        configName: 'base-config',
        identity: emailToIdentity(CURRENT_USER_EMAIL),
        description: 'Updated base config',
        editors: [],
        maintainers: [],
        prevVersion: 1,
        base: {
          value: asConfigValue({threshold: 200}),
          schema: asConfigSchema({type: 'object', properties: {threshold: {type: 'number'}}}),
          overrides: [],
        },
        environments: environments.map(env => ({
          environmentId: env.id,
          value: asConfigValue({threshold: 200}),
          schema: asConfigSchema({type: 'object', properties: {threshold: {type: 'number'}}}),
          overrides: [],
          useBaseSchema: false,
        })),
      });

      await fixture.syncReplica();

      const events = await eventsPromise;
      abortController.abort();

      // Should receive 2 events: one for base-config update, one for referencing-config update
      expect(events.length).toBeGreaterThanOrEqual(2);

      const baseConfigEvent = events.find(e => e.configName === 'base-config');
      const referencingConfigEvent = events.find(e => e.configName === 'referencing-config');

      expect(baseConfigEvent).toBeDefined();
      expect(baseConfigEvent?.type).toBe('config_updated');
      expect(baseConfigEvent?.value).toEqual({threshold: 200});

      expect(referencingConfigEvent).toBeDefined();
      expect(referencingConfigEvent?.type).toBe('config_updated');
    });

    it('should emit update events for multiple configs that reference the same config', async () => {
      // Create the base config
      await fixture.createConfig({
        name: 'shared-base',
        value: {limit: 50},
        schema: null,
        overrides: [],
        description: 'Shared base config',
        identity: emailToIdentity(CURRENT_USER_EMAIL),
        editorEmails: [],
        maintainerEmails: [],
        projectId: fixture.projectId,
      });

      const {environments} = await fixture.engine.useCases.getProjectEnvironments(GLOBAL_CONTEXT, {
        projectId: fixture.projectId,
        identity: emailToIdentity(CURRENT_USER_EMAIL),
      });

      // Create first config that references shared-base
      const refOverrides1 = [
        {
          name: 'ref-override-1',
          conditions: [
            {
              operator: 'greater_than' as const,
              property: 'count',
              value: {
                type: 'reference' as const,
                projectId: fixture.projectId,
                configName: 'shared-base',
                path: ['limit'],
              },
            },
          ],
          value: asConfigValue({status: 'over-limit'}),
        },
      ];

      await fixture.engine.useCases.createConfig(GLOBAL_CONTEXT, {
        name: 'consumer-config-1',
        description: 'First config referencing shared-base',
        identity: emailToIdentity(CURRENT_USER_EMAIL),
        editorEmails: [],
        maintainerEmails: [],
        projectId: fixture.projectId,
        defaultVariant: {
          value: asConfigValue({status: 'normal'}),
          schema: null,
          overrides: refOverrides1,
        },
        environmentVariants: environments.map(env => ({
          environmentId: env.id,
          value: asConfigValue({status: 'normal'}),
          schema: null,
          overrides: refOverrides1,
          useBaseSchema: false,
        })),
      });

      // Create second config that also references shared-base
      const refOverrides2 = [
        {
          name: 'ref-override-2',
          conditions: [
            {
              operator: 'less_than' as const,
              property: 'value',
              value: {
                type: 'reference' as const,
                projectId: fixture.projectId,
                configName: 'shared-base',
                path: ['limit'],
              },
            },
          ],
          value: asConfigValue({allowed: true}),
        },
      ];

      await fixture.engine.useCases.createConfig(GLOBAL_CONTEXT, {
        name: 'consumer-config-2',
        description: 'Second config referencing shared-base',
        identity: emailToIdentity(CURRENT_USER_EMAIL),
        editorEmails: [],
        maintainerEmails: [],
        projectId: fixture.projectId,
        defaultVariant: {
          value: asConfigValue({allowed: false}),
          schema: null,
          overrides: refOverrides2,
        },
        environmentVariants: environments.map(env => ({
          environmentId: env.id,
          value: asConfigValue({allowed: false}),
          schema: null,
          overrides: refOverrides2,
          useBaseSchema: false,
        })),
      });

      await fixture.syncReplica();

      const abortController = new AbortController();

      // Start listening for events
      const eventsPromise = collectEvents(
        fixture.edge.useCases.getProjectEvents(GLOBAL_CONTEXT, {
          projectId: fixture.projectId,
          environmentId: fixture.productionEnvironmentId,
          abortSignal: abortController.signal,
        }),
        3, // Expect 3 events: shared-base + 2 consumer configs
        3000,
      );

      await wait(50);

      // Get the base config ID
      const {config: sharedBaseDetails} = await fixture.trpc.getConfig({
        name: 'shared-base',
        projectId: fixture.projectId,
      });

      // Update the shared base config
      await fixture.engine.useCases.updateConfig(GLOBAL_CONTEXT, {
        projectId: fixture.projectId,
        configName: 'shared-base',
        identity: emailToIdentity(CURRENT_USER_EMAIL),
        description: 'Updated shared base',
        editors: [],
        maintainers: [],
        prevVersion: 1,
        base: {
          value: asConfigValue({limit: 100}),
          schema: null,
          overrides: [],
        },
        environments: environments.map(env => ({
          environmentId: env.id,
          value: asConfigValue({limit: 100}),
          schema: null,
          overrides: [],
          useBaseSchema: false,
        })),
      });

      await fixture.syncReplica();

      const events = await eventsPromise;
      abortController.abort();

      // Should receive events for all 3 configs
      expect(events.length).toBeGreaterThanOrEqual(3);

      const sharedBaseEvent = events.find(e => e.configName === 'shared-base');
      const consumer1Event = events.find(e => e.configName === 'consumer-config-1');
      const consumer2Event = events.find(e => e.configName === 'consumer-config-2');

      expect(sharedBaseEvent).toBeDefined();
      expect(sharedBaseEvent?.type).toBe('config_updated');

      expect(consumer1Event).toBeDefined();
      expect(consumer1Event?.type).toBe('config_updated');

      expect(consumer2Event).toBeDefined();
      expect(consumer2Event?.type).toBe('config_updated');
    });

    it('should not emit reference events when a non-referenced config is updated', async () => {
      // Create two independent configs with no references
      await fixture.createConfig({
        name: 'independent-config-a',
        value: {a: 1},
        schema: null,
        overrides: [],
        description: 'Independent config A',
        identity: emailToIdentity(CURRENT_USER_EMAIL),
        editorEmails: [],
        maintainerEmails: [],
        projectId: fixture.projectId,
      });

      await fixture.createConfig({
        name: 'independent-config-b',
        value: {b: 2},
        schema: null,
        overrides: [],
        description: 'Independent config B',
        identity: emailToIdentity(CURRENT_USER_EMAIL),
        editorEmails: [],
        maintainerEmails: [],
        projectId: fixture.projectId,
      });

      await fixture.syncReplica();

      const abortController = new AbortController();

      const eventsPromise = collectEvents(
        fixture.edge.useCases.getProjectEvents(GLOBAL_CONTEXT, {
          projectId: fixture.projectId,
          environmentId: fixture.productionEnvironmentId,
          abortSignal: abortController.signal,
        }),
        2,
        2000,
      );

      await wait(50);

      // Get config A's ID
      const {config: configADetails} = await fixture.trpc.getConfig({
        name: 'independent-config-a',
        projectId: fixture.projectId,
      });

      const {environments} = await fixture.engine.useCases.getProjectEnvironments(GLOBAL_CONTEXT, {
        projectId: fixture.projectId,
        identity: emailToIdentity(CURRENT_USER_EMAIL),
      });

      // Update config A
      await fixture.engine.useCases.updateConfig(GLOBAL_CONTEXT, {
        projectId: fixture.projectId,
        configName: 'independent-config-a',
        identity: emailToIdentity(CURRENT_USER_EMAIL),
        description: 'Updated config A',
        editors: [],
        maintainers: [],
        prevVersion: 1,
        base: {
          value: asConfigValue({a: 10}),
          schema: null,
          overrides: [],
        },
        environments: environments.map(env => ({
          environmentId: env.id,
          value: asConfigValue({a: 10}),
          schema: null,
          overrides: [],
          useBaseSchema: false,
        })),
      });

      await fixture.syncReplica();

      const events = await eventsPromise;
      abortController.abort();

      // Should only receive 1 event for config A, not for config B
      expect(events).toHaveLength(1);
      expect(events[0].configName).toBe('independent-config-a');
    });
  });

  describe('edge cases', () => {
    it('should handle multiple updates to the same config', async () => {
      const abortController = new AbortController();

      const eventsPromise = collectEvents(
        fixture.edge.useCases.getProjectEvents(GLOBAL_CONTEXT, {
          projectId: fixture.projectId,
          environmentId: fixture.productionEnvironmentId,
          abortSignal: abortController.signal,
        }),
        3, // 1 create + 2 updates
        5000,
      );

      await fixture.syncReplica();
      await wait(50);

      const {configId} = await fixture.createConfig({
        name: 'multi-update-config',
        value: {counter: 0},
        schema: null,
        overrides: [],
        description: 'Config for multi-update testing',
        identity: emailToIdentity(CURRENT_USER_EMAIL),
        editorEmails: [],
        maintainerEmails: [],
        projectId: fixture.projectId,
      });

      await fixture.syncReplica();

      const {environments} = await fixture.engine.useCases.getProjectEnvironments(GLOBAL_CONTEXT, {
        projectId: fixture.projectId,
        identity: emailToIdentity(CURRENT_USER_EMAIL),
      });

      // Perform 2 updates
      for (let i = 1; i <= 2; i++) {
        await fixture.engine.useCases.updateConfig(GLOBAL_CONTEXT, {
          projectId: fixture.projectId,
          configName: 'multi-update-config',
          identity: emailToIdentity(CURRENT_USER_EMAIL),
          description: `Update ${i}`,
          editors: [],
          maintainers: [],
          prevVersion: i,
          base: {
            value: asConfigValue({counter: i}),
            schema: null,
            overrides: [],
          },
          environments: environments.map(env => ({
            environmentId: env.id,
            value: asConfigValue({counter: i}),
            schema: null,
            overrides: [],
            useBaseSchema: false,
          })),
        });
        await fixture.syncReplica();
      }

      const events = await eventsPromise;
      abortController.abort();

      // Should receive 1 create + 2 update events = 3 total
      expect(events.length).toBeGreaterThanOrEqual(3);

      const createEvent = events.find(
        e => e.type === 'config_created' && e.configName === 'multi-update-config',
      );
      expect(createEvent).toBeDefined();

      // Should have update events
      const updateEvents = events.filter(
        e => e.type === 'config_updated' && e.configName === 'multi-update-config',
      );
      expect(updateEvents.length).toBeGreaterThanOrEqual(2);
    });

    it('should handle creating and immediately deleting a config', async () => {
      const abortController = new AbortController();

      const eventsPromise = collectEvents(
        fixture.edge.useCases.getProjectEvents(GLOBAL_CONTEXT, {
          projectId: fixture.projectId,
          environmentId: fixture.productionEnvironmentId,
          abortSignal: abortController.signal,
        }),
        2,
        3000,
      );

      await fixture.syncReplica();
      await wait(50);

      // Create a config
      const {configId} = await fixture.createConfig({
        name: 'ephemeral-config',
        value: {temporary: true},
        schema: null,
        overrides: [],
        description: 'Ephemeral config',
        identity: emailToIdentity(CURRENT_USER_EMAIL),
        editorEmails: [],
        maintainerEmails: [],
        projectId: fixture.projectId,
      });
      await fixture.syncReplica();

      // Immediately delete it
      await fixture.engine.useCases.deleteConfig(GLOBAL_CONTEXT, {
        projectId: fixture.projectId,
        configName: 'ephemeral-config',
        identity: emailToIdentity(CURRENT_USER_EMAIL),
        prevVersion: 1,
      });
      await fixture.syncReplica();

      const events = await eventsPromise;
      abortController.abort();

      expect(events.length).toBeGreaterThanOrEqual(2);

      const createEvent = events.find(
        e => e.type === 'config_created' && e.configName === 'ephemeral-config',
      );
      const deleteEvent = events.find(
        e => e.type === 'config_deleted' && e.configName === 'ephemeral-config',
      );

      expect(createEvent).toBeDefined();
      expect(deleteEvent).toBeDefined();
    });

    it('should return development environment values when subscribed to development', async () => {
      const abortController = new AbortController();

      // Subscribe to development environment
      const eventsPromise = collectEvents(
        fixture.edge.useCases.getProjectEvents(GLOBAL_CONTEXT, {
          projectId: fixture.projectId,
          environmentId: fixture.developmentEnvironmentId,
          abortSignal: abortController.signal,
        }),
        1,
      );

      await fixture.syncReplica();
      await wait(50);

      const {environments} = await fixture.engine.useCases.getProjectEnvironments(GLOBAL_CONTEXT, {
        projectId: fixture.projectId,
        identity: emailToIdentity(CURRENT_USER_EMAIL),
      });

      // Create a config with different values per environment
      await fixture.engine.useCases.createConfig(GLOBAL_CONTEXT, {
        name: 'dev-vs-prod-config',
        description: 'Config with different values per environment',
        identity: emailToIdentity(CURRENT_USER_EMAIL),
        editorEmails: [],
        maintainerEmails: [],
        projectId: fixture.projectId,
        defaultVariant: {
          value: asConfigValue({env: 'default'}),
          schema: null,
          overrides: [],
        },
        environmentVariants: environments.map(env => ({
          environmentId: env.id,
          value: asConfigValue({
            env: env.name === 'Production' ? 'production' : 'development',
            debug: env.name !== 'Production',
          }),
          schema: null,
          overrides: [],
          useBaseSchema: false,
        })),
      });

      await fixture.syncReplica();

      const events = await eventsPromise;
      abortController.abort();

      expect(events).toHaveLength(1);
      expect(events[0].configName).toBe('dev-vs-prod-config');
      // Should get development values since we subscribed to development environment
      expect(events[0].value).toEqual({env: 'development', debug: true});
    });

    it('should handle multiple concurrent subscriptions to the same project', async () => {
      const abortController1 = new AbortController();
      const abortController2 = new AbortController();

      // Two concurrent subscriptions to the same project
      const eventsPromise1 = collectEvents(
        fixture.edge.useCases.getProjectEvents(GLOBAL_CONTEXT, {
          projectId: fixture.projectId,
          environmentId: fixture.productionEnvironmentId,
          abortSignal: abortController1.signal,
        }),
        1,
      );

      const eventsPromise2 = collectEvents(
        fixture.edge.useCases.getProjectEvents(GLOBAL_CONTEXT, {
          projectId: fixture.projectId,
          environmentId: fixture.developmentEnvironmentId,
          abortSignal: abortController2.signal,
        }),
        1,
      );

      await fixture.syncReplica();
      await wait(50);

      // Create a config
      await fixture.createConfig({
        name: 'concurrent-sub-config',
        value: {shared: true},
        schema: null,
        overrides: [],
        description: 'Config for concurrent subscription testing',
        identity: emailToIdentity(CURRENT_USER_EMAIL),
        editorEmails: [],
        maintainerEmails: [],
        projectId: fixture.projectId,
      });
      await fixture.syncReplica();

      const events1 = await eventsPromise1;
      const events2 = await eventsPromise2;
      abortController1.abort();
      abortController2.abort();

      // Both subscriptions should receive the event
      expect(events1).toHaveLength(1);
      expect(events1[0].configName).toBe('concurrent-sub-config');

      expect(events2).toHaveLength(1);
      expect(events2[0].configName).toBe('concurrent-sub-config');
    });

    it('should handle config with empty overrides array', async () => {
      const abortController = new AbortController();

      const eventsPromise = collectEvents(
        fixture.edge.useCases.getProjectEvents(GLOBAL_CONTEXT, {
          projectId: fixture.projectId,
          environmentId: fixture.productionEnvironmentId,
          abortSignal: abortController.signal,
        }),
        1,
      );

      await fixture.syncReplica();
      await wait(50);

      await fixture.createConfig({
        name: 'no-overrides-config',
        value: {simple: 'value'},
        schema: null,
        overrides: [],
        description: 'Config with no overrides',
        identity: emailToIdentity(CURRENT_USER_EMAIL),
        editorEmails: [],
        maintainerEmails: [],
        projectId: fixture.projectId,
      });
      await fixture.syncReplica();

      const events = await eventsPromise;
      abortController.abort();

      expect(events).toHaveLength(1);
      expect(events[0].overrides).toEqual([]);
    });

    it('should handle config with complex nested value', async () => {
      const abortController = new AbortController();

      const eventsPromise = collectEvents(
        fixture.edge.useCases.getProjectEvents(GLOBAL_CONTEXT, {
          projectId: fixture.projectId,
          environmentId: fixture.productionEnvironmentId,
          abortSignal: abortController.signal,
        }),
        1,
      );

      await fixture.syncReplica();
      await wait(50);

      const complexValue = {
        nested: {
          deeply: {
            value: 42,
            array: [1, 2, {inner: 'string'}],
          },
        },
        list: ['a', 'b', 'c'],
        nullValue: null,
        booleans: {true: true, false: false},
      };

      await fixture.createConfig({
        name: 'complex-value-config',
        value: complexValue,
        schema: null,
        overrides: [],
        description: 'Config with complex nested value',
        identity: emailToIdentity(CURRENT_USER_EMAIL),
        editorEmails: [],
        maintainerEmails: [],
        projectId: fixture.projectId,
      });
      await fixture.syncReplica();

      const events = await eventsPromise;
      abortController.abort();

      expect(events).toHaveLength(1);
      expect(events[0].value).toEqual(complexValue);
    });

    it('should handle config with null value', async () => {
      const abortController = new AbortController();

      const eventsPromise = collectEvents(
        fixture.edge.useCases.getProjectEvents(GLOBAL_CONTEXT, {
          projectId: fixture.projectId,
          environmentId: fixture.productionEnvironmentId,
          abortSignal: abortController.signal,
        }),
        1,
      );

      await fixture.syncReplica();
      await wait(50);

      await fixture.createConfig({
        name: 'null-value-config',
        value: null,
        schema: null,
        overrides: [],
        description: 'Config with null value',
        identity: emailToIdentity(CURRENT_USER_EMAIL),
        editorEmails: [],
        maintainerEmails: [],
        projectId: fixture.projectId,
      });
      await fixture.syncReplica();

      const events = await eventsPromise;
      abortController.abort();

      expect(events).toHaveLength(1);
      expect(events[0].value).toBeNull();
    });

    it('should handle config with array value', async () => {
      const abortController = new AbortController();

      const eventsPromise = collectEvents(
        fixture.edge.useCases.getProjectEvents(GLOBAL_CONTEXT, {
          projectId: fixture.projectId,
          environmentId: fixture.productionEnvironmentId,
          abortSignal: abortController.signal,
        }),
        1,
      );

      await fixture.syncReplica();
      await wait(50);

      const arrayValue = ['item1', 'item2', {nested: true}, 42, null];

      await fixture.createConfig({
        name: 'array-value-config',
        value: arrayValue,
        schema: null,
        overrides: [],
        description: 'Config with array value',
        identity: emailToIdentity(CURRENT_USER_EMAIL),
        editorEmails: [],
        maintainerEmails: [],
        projectId: fixture.projectId,
      });
      await fixture.syncReplica();

      const events = await eventsPromise;
      abortController.abort();

      expect(events).toHaveLength(1);
      expect(events[0].value).toEqual(arrayValue);
    });

    it('should handle config with primitive values (string, number, boolean)', async () => {
      const abortController = new AbortController();

      const eventsPromise = collectEvents(
        fixture.edge.useCases.getProjectEvents(GLOBAL_CONTEXT, {
          projectId: fixture.projectId,
          environmentId: fixture.productionEnvironmentId,
          abortSignal: abortController.signal,
        }),
        3,
        3000,
      );

      await fixture.syncReplica();
      await wait(50);

      // String value
      await fixture.createConfig({
        name: 'string-value-config',
        value: 'hello world',
        schema: null,
        overrides: [],
        description: 'Config with string value',
        identity: emailToIdentity(CURRENT_USER_EMAIL),
        editorEmails: [],
        maintainerEmails: [],
        projectId: fixture.projectId,
      });
      await fixture.syncReplica();

      // Number value
      await fixture.createConfig({
        name: 'number-value-config',
        value: 42.5,
        schema: null,
        overrides: [],
        description: 'Config with number value',
        identity: emailToIdentity(CURRENT_USER_EMAIL),
        editorEmails: [],
        maintainerEmails: [],
        projectId: fixture.projectId,
      });
      await fixture.syncReplica();

      // Boolean value
      await fixture.createConfig({
        name: 'boolean-value-config',
        value: true,
        schema: null,
        overrides: [],
        description: 'Config with boolean value',
        identity: emailToIdentity(CURRENT_USER_EMAIL),
        editorEmails: [],
        maintainerEmails: [],
        projectId: fixture.projectId,
      });
      await fixture.syncReplica();

      const events = await eventsPromise;
      abortController.abort();

      expect(events).toHaveLength(3);

      const stringEvent = events.find(e => e.configName === 'string-value-config');
      const numberEvent = events.find(e => e.configName === 'number-value-config');
      const booleanEvent = events.find(e => e.configName === 'boolean-value-config');

      expect(stringEvent?.value).toBe('hello world');
      expect(numberEvent?.value).toBe(42.5);
      expect(booleanEvent?.value).toBe(true);
    });

    it('should return empty array when aborted before any events', async () => {
      const abortController = new AbortController();

      const eventsPromise = collectEvents(
        fixture.edge.useCases.getProjectEvents(GLOBAL_CONTEXT, {
          projectId: fixture.projectId,
          environmentId: fixture.productionEnvironmentId,
          abortSignal: abortController.signal,
        }),
        1,
        500, // Short timeout
      );

      await fixture.syncReplica();
      await wait(50);

      // Abort immediately without creating any configs
      abortController.abort();

      const events = await eventsPromise;

      expect(events).toHaveLength(0);
    });
  });

  describe('version tracking', () => {
    it('should emit correct version numbers through config lifecycle', async () => {
      const abortController = new AbortController();

      const eventsPromise = collectEvents(
        fixture.edge.useCases.getProjectEvents(GLOBAL_CONTEXT, {
          projectId: fixture.projectId,
          environmentId: fixture.productionEnvironmentId,
          abortSignal: abortController.signal,
        }),
        4,
        5000,
      );

      await fixture.syncReplica();
      await wait(50);

      // Create config (version 1)
      const {configId} = await fixture.createConfig({
        name: 'version-tracking-config',
        value: {v: 1},
        schema: null,
        overrides: [],
        description: 'Version tracking test',
        identity: emailToIdentity(CURRENT_USER_EMAIL),
        editorEmails: [],
        maintainerEmails: [],
        projectId: fixture.projectId,
      });
      await fixture.syncReplica();

      const {environments} = await fixture.engine.useCases.getProjectEnvironments(GLOBAL_CONTEXT, {
        projectId: fixture.projectId,
        identity: emailToIdentity(CURRENT_USER_EMAIL),
      });

      // Update to version 2
      await fixture.engine.useCases.updateConfig(GLOBAL_CONTEXT, {
        projectId: fixture.projectId,
        configName: 'version-tracking-config',
        identity: emailToIdentity(CURRENT_USER_EMAIL),
        description: 'Version 2',
        editors: [],
        maintainers: [],
        prevVersion: 1,
        base: {value: asConfigValue({v: 2}), schema: null, overrides: []},
        environments: environments.map(env => ({
          environmentId: env.id,
          value: asConfigValue({v: 2}),
          schema: null,
          overrides: [],
          useBaseSchema: false,
        })),
      });
      await fixture.syncReplica();

      // Update to version 3
      await fixture.engine.useCases.updateConfig(GLOBAL_CONTEXT, {
        projectId: fixture.projectId,
        configName: 'version-tracking-config',
        identity: emailToIdentity(CURRENT_USER_EMAIL),
        description: 'Version 3',
        editors: [],
        maintainers: [],
        prevVersion: 2,
        base: {value: asConfigValue({v: 3}), schema: null, overrides: []},
        environments: environments.map(env => ({
          environmentId: env.id,
          value: asConfigValue({v: 3}),
          schema: null,
          overrides: [],
          useBaseSchema: false,
        })),
      });
      await fixture.syncReplica();

      // Update to version 4
      await fixture.engine.useCases.updateConfig(GLOBAL_CONTEXT, {
        projectId: fixture.projectId,
        configName: 'version-tracking-config',
        identity: emailToIdentity(CURRENT_USER_EMAIL),
        description: 'Version 4',
        editors: [],
        maintainers: [],
        prevVersion: 3,
        base: {value: asConfigValue({v: 4}), schema: null, overrides: []},
        environments: environments.map(env => ({
          environmentId: env.id,
          value: asConfigValue({v: 4}),
          schema: null,
          overrides: [],
          useBaseSchema: false,
        })),
      });
      await fixture.syncReplica();

      const events = await eventsPromise;
      abortController.abort();

      expect(events.length).toBeGreaterThanOrEqual(4);

      // Filter events for our config
      const configEvents = events.filter(e => e.configName === 'version-tracking-config');

      // Check versions are correct
      const versions = configEvents.map(e => e.version);
      expect(versions).toContain(1);
      expect(versions).toContain(2);
      expect(versions).toContain(3);
      expect(versions).toContain(4);
    });
  });

  describe('override modifications', () => {
    it('should emit event when overrides are added to existing config', async () => {
      // Create config without overrides
      const {configId} = await fixture.createConfig({
        name: 'add-overrides-config',
        value: {feature: 'default'},
        schema: null,
        overrides: [],
        description: 'Config to add overrides',
        identity: emailToIdentity(CURRENT_USER_EMAIL),
        editorEmails: [],
        maintainerEmails: [],
        projectId: fixture.projectId,
      });
      await fixture.syncReplica();

      const abortController = new AbortController();

      const eventsPromise = collectEvents(
        fixture.edge.useCases.getProjectEvents(GLOBAL_CONTEXT, {
          projectId: fixture.projectId,
          environmentId: fixture.productionEnvironmentId,
          abortSignal: abortController.signal,
        }),
        1,
      );

      await wait(50);

      const {environments} = await fixture.engine.useCases.getProjectEnvironments(GLOBAL_CONTEXT, {
        projectId: fixture.projectId,
        identity: emailToIdentity(CURRENT_USER_EMAIL),
      });

      // Update config to add overrides
      const newOverrides: Override[] = [
        {
          name: 'new-override',
          conditions: [
            {
              operator: 'equals',
              property: 'userType',
              value: {type: 'literal', value: asConfigValue('premium')},
            },
          ],
          value: asConfigValue({feature: 'premium-version'}),
        },
      ];

      await fixture.engine.useCases.updateConfig(GLOBAL_CONTEXT, {
        projectId: fixture.projectId,
        configName: 'add-overrides-config',
        identity: emailToIdentity(CURRENT_USER_EMAIL),
        description: 'Added overrides',
        editors: [],
        maintainers: [],
        prevVersion: 1,
        base: {
          value: asConfigValue({feature: 'default'}),
          schema: null,
          overrides: newOverrides,
        },
        environments: environments.map(env => ({
          environmentId: env.id,
          value: asConfigValue({feature: 'default'}),
          schema: null,
          overrides: newOverrides,
          useBaseSchema: false,
        })),
      });
      await fixture.syncReplica();

      const events = await eventsPromise;
      abortController.abort();

      expect(events).toHaveLength(1);
      expect(events[0].type).toBe('config_updated');
      expect(events[0].overrides).toHaveLength(1);
      expect(events[0].overrides[0].name).toBe('new-override');
    });

    it('should emit event when overrides are removed from existing config', async () => {
      const {environments} = await fixture.engine.useCases.getProjectEnvironments(GLOBAL_CONTEXT, {
        projectId: fixture.projectId,
        identity: emailToIdentity(CURRENT_USER_EMAIL),
      });

      const initialOverrides: Override[] = [
        {
          name: 'to-be-removed',
          conditions: [
            {
              operator: 'equals',
              property: 'flag',
              value: {type: 'literal', value: asConfigValue(true)},
            },
          ],
          value: asConfigValue({mode: 'special'}),
        },
      ];

      // Create config with overrides
      const {configId} = await fixture.engine.useCases.createConfig(GLOBAL_CONTEXT, {
        name: 'remove-overrides-config',
        description: 'Config to remove overrides',
        identity: emailToIdentity(CURRENT_USER_EMAIL),
        editorEmails: [],
        maintainerEmails: [],
        projectId: fixture.projectId,
        defaultVariant: {
          value: asConfigValue({mode: 'normal'}),
          schema: null,
          overrides: initialOverrides,
        },
        environmentVariants: environments.map(env => ({
          environmentId: env.id,
          value: asConfigValue({mode: 'normal'}),
          schema: null,
          overrides: initialOverrides,
          useBaseSchema: false,
        })),
      });
      await fixture.syncReplica();

      const abortController = new AbortController();

      const eventsPromise = collectEvents(
        fixture.edge.useCases.getProjectEvents(GLOBAL_CONTEXT, {
          projectId: fixture.projectId,
          environmentId: fixture.productionEnvironmentId,
          abortSignal: abortController.signal,
        }),
        1,
      );

      await wait(50);

      // Update config to remove overrides
      await fixture.engine.useCases.updateConfig(GLOBAL_CONTEXT, {
        projectId: fixture.projectId,
        configName: 'remove-overrides-config',
        identity: emailToIdentity(CURRENT_USER_EMAIL),
        description: 'Removed overrides',
        editors: [],
        maintainers: [],
        prevVersion: 1,
        base: {
          value: asConfigValue({mode: 'normal'}),
          schema: null,
          overrides: [], // Empty overrides
        },
        environments: environments.map(env => ({
          environmentId: env.id,
          value: asConfigValue({mode: 'normal'}),
          schema: null,
          overrides: [],
          useBaseSchema: false,
        })),
      });
      await fixture.syncReplica();

      const events = await eventsPromise;
      abortController.abort();

      expect(events).toHaveLength(1);
      expect(events[0].type).toBe('config_updated');
      expect(events[0].overrides).toHaveLength(0);
    });

    it('should handle config with multiple overrides', async () => {
      const abortController = new AbortController();

      const eventsPromise = collectEvents(
        fixture.edge.useCases.getProjectEvents(GLOBAL_CONTEXT, {
          projectId: fixture.projectId,
          environmentId: fixture.productionEnvironmentId,
          abortSignal: abortController.signal,
        }),
        1,
      );

      await fixture.syncReplica();
      await wait(50);

      const {environments} = await fixture.engine.useCases.getProjectEnvironments(GLOBAL_CONTEXT, {
        projectId: fixture.projectId,
        identity: emailToIdentity(CURRENT_USER_EMAIL),
      });

      const multipleOverrides: Override[] = [
        {
          name: 'override-1',
          conditions: [
            {
              operator: 'equals',
              property: 'region',
              value: {type: 'literal', value: asConfigValue('US')},
            },
          ],
          value: asConfigValue({variant: 'us'}),
        },
        {
          name: 'override-2',
          conditions: [
            {
              operator: 'equals',
              property: 'region',
              value: {type: 'literal', value: asConfigValue('EU')},
            },
          ],
          value: asConfigValue({variant: 'eu'}),
        },
        {
          name: 'override-3',
          conditions: [
            {
              operator: 'equals',
              property: 'isPremium',
              value: {type: 'literal', value: asConfigValue(true)},
            },
          ],
          value: asConfigValue({variant: 'premium'}),
        },
      ];

      await fixture.engine.useCases.createConfig(GLOBAL_CONTEXT, {
        name: 'multi-override-config',
        description: 'Config with multiple overrides',
        identity: emailToIdentity(CURRENT_USER_EMAIL),
        editorEmails: [],
        maintainerEmails: [],
        projectId: fixture.projectId,
        defaultVariant: {
          value: asConfigValue({variant: 'default'}),
          schema: null,
          overrides: multipleOverrides,
        },
        environmentVariants: environments.map(env => ({
          environmentId: env.id,
          value: asConfigValue({variant: 'default'}),
          schema: null,
          overrides: multipleOverrides,
          useBaseSchema: false,
        })),
      });
      await fixture.syncReplica();

      const events = await eventsPromise;
      abortController.abort();

      expect(events).toHaveLength(1);
      expect(events[0].overrides).toHaveLength(3);

      const overrideNames = events[0].overrides.map(o => o.name);
      expect(overrideNames).toContain('override-1');
      expect(overrideNames).toContain('override-2');
      expect(overrideNames).toContain('override-3');
    });
  });

  describe('reference edge cases', () => {
    it('should handle when referenced config is deleted', async () => {
      // Create the base config that will be referenced
      const {configId: baseConfigId} = await fixture.createConfig({
        name: 'deletable-base',
        value: {data: 'original'},
        schema: null,
        overrides: [],
        description: 'Base config that will be deleted',
        identity: emailToIdentity(CURRENT_USER_EMAIL),
        editorEmails: [],
        maintainerEmails: [],
        projectId: fixture.projectId,
      });

      const {environments} = await fixture.engine.useCases.getProjectEnvironments(GLOBAL_CONTEXT, {
        projectId: fixture.projectId,
        identity: emailToIdentity(CURRENT_USER_EMAIL),
      });

      // Create a config that references the base config
      const referencingOverrides: Override[] = [
        {
          name: 'ref-to-deletable',
          conditions: [
            {
              operator: 'equals',
              property: 'check',
              value: {
                type: 'reference',
                projectId: fixture.projectId,
                configName: 'deletable-base',
                path: ['data'],
              },
            },
          ],
          value: asConfigValue({matched: true}),
        },
      ];

      await fixture.engine.useCases.createConfig(GLOBAL_CONTEXT, {
        name: 'refs-deletable-config',
        description: 'Config that references deletable-base',
        identity: emailToIdentity(CURRENT_USER_EMAIL),
        editorEmails: [],
        maintainerEmails: [],
        projectId: fixture.projectId,
        defaultVariant: {
          value: asConfigValue({matched: false}),
          schema: null,
          overrides: referencingOverrides,
        },
        environmentVariants: environments.map(env => ({
          environmentId: env.id,
          value: asConfigValue({matched: false}),
          schema: null,
          overrides: referencingOverrides,
          useBaseSchema: false,
        })),
      });

      await fixture.syncReplica();

      const abortController = new AbortController();

      const eventsPromise = collectEvents(
        fixture.edge.useCases.getProjectEvents(GLOBAL_CONTEXT, {
          projectId: fixture.projectId,
          environmentId: fixture.productionEnvironmentId,
          abortSignal: abortController.signal,
        }),
        2, // Expect delete event for base + update for referencing
        3000,
      );

      await wait(50);

      // Delete the base config
      await fixture.engine.useCases.deleteConfig(GLOBAL_CONTEXT, {
        projectId: fixture.projectId,
        configName: 'deletable-base',
        identity: emailToIdentity(CURRENT_USER_EMAIL),
        prevVersion: 1,
      });
      await fixture.syncReplica();

      const events = await eventsPromise;
      abortController.abort();

      // Should receive delete event for base config
      const deleteEvent = events.find(
        e => e.type === 'config_deleted' && e.configName === 'deletable-base',
      );
      expect(deleteEvent).toBeDefined();

      // Should also receive update event for referencing config
      const refUpdateEvent = events.find(
        e => e.type === 'config_updated' && e.configName === 'refs-deletable-config',
      );
      expect(refUpdateEvent).toBeDefined();
    });

    it('should handle adding a new reference to an existing config', async () => {
      // Create the base config that will be referenced later
      await fixture.createConfig({
        name: 'later-referenced-base',
        value: {refValue: 999},
        schema: null,
        overrides: [],
        description: 'Base config to be referenced later',
        identity: emailToIdentity(CURRENT_USER_EMAIL),
        editorEmails: [],
        maintainerEmails: [],
        projectId: fixture.projectId,
      });

      // Create a config without references initially
      const {configId} = await fixture.createConfig({
        name: 'will-add-reference',
        value: {status: 'independent'},
        schema: null,
        overrides: [],
        description: 'Config that will add a reference',
        identity: emailToIdentity(CURRENT_USER_EMAIL),
        editorEmails: [],
        maintainerEmails: [],
        projectId: fixture.projectId,
      });

      await fixture.syncReplica();

      const abortController = new AbortController();

      const eventsPromise = collectEvents(
        fixture.edge.useCases.getProjectEvents(GLOBAL_CONTEXT, {
          projectId: fixture.projectId,
          environmentId: fixture.productionEnvironmentId,
          abortSignal: abortController.signal,
        }),
        1,
      );

      await wait(50);

      const {environments} = await fixture.engine.useCases.getProjectEnvironments(GLOBAL_CONTEXT, {
        projectId: fixture.projectId,
        identity: emailToIdentity(CURRENT_USER_EMAIL),
      });

      // Update config to add a reference
      const newRefOverrides: Override[] = [
        {
          name: 'new-reference',
          conditions: [
            {
              operator: 'equals',
              property: 'threshold',
              value: {
                type: 'reference',
                projectId: fixture.projectId,
                configName: 'later-referenced-base',
                path: ['refValue'],
              },
            },
          ],
          value: asConfigValue({status: 'matched'}),
        },
      ];

      await fixture.engine.useCases.updateConfig(GLOBAL_CONTEXT, {
        projectId: fixture.projectId,
        configName: 'will-add-reference',
        identity: emailToIdentity(CURRENT_USER_EMAIL),
        description: 'Added reference',
        editors: [],
        maintainers: [],
        prevVersion: 1,
        base: {
          value: asConfigValue({status: 'independent'}),
          schema: null,
          overrides: newRefOverrides,
        },
        environments: environments.map(env => ({
          environmentId: env.id,
          value: asConfigValue({status: 'independent'}),
          schema: null,
          overrides: newRefOverrides,
          useBaseSchema: false,
        })),
      });
      await fixture.syncReplica();

      const events = await eventsPromise;
      abortController.abort();

      expect(events).toHaveLength(1);
      expect(events[0].type).toBe('config_updated');
      expect(events[0].configName).toBe('will-add-reference');
    });
  });

  describe('subscription edge cases', () => {
    it('should receive no events when subscribed to non-existent project', async () => {
      const abortController = new AbortController();
      const fakeProjectId = 'non-existent-project-id-12345';

      const eventsPromise = collectEvents(
        fixture.edge.useCases.getProjectEvents(GLOBAL_CONTEXT, {
          projectId: fakeProjectId,
          environmentId: fixture.productionEnvironmentId,
          abortSignal: abortController.signal,
        }),
        1,
        500, // Short timeout
      );

      await fixture.syncReplica();
      await wait(50);

      // Create a config in the real project
      await fixture.createConfig({
        name: 'real-project-config',
        value: {real: true},
        schema: null,
        overrides: [],
        description: 'Config in real project',
        identity: emailToIdentity(CURRENT_USER_EMAIL),
        editorEmails: [],
        maintainerEmails: [],
        projectId: fixture.projectId,
      });
      await fixture.syncReplica();

      const events = await eventsPromise;
      abortController.abort();

      // Should not receive any events from the real project
      expect(events).toHaveLength(0);
    });

    it('should handle resubscribing after abort', async () => {
      // First subscription
      const abortController1 = new AbortController();

      const eventsPromise1 = collectEvents(
        fixture.edge.useCases.getProjectEvents(GLOBAL_CONTEXT, {
          projectId: fixture.projectId,
          environmentId: fixture.productionEnvironmentId,
          abortSignal: abortController1.signal,
        }),
        1,
      );

      await fixture.syncReplica();
      await wait(50);

      await fixture.createConfig({
        name: 'first-sub-config',
        value: {sub: 1},
        schema: null,
        overrides: [],
        description: 'First subscription config',
        identity: emailToIdentity(CURRENT_USER_EMAIL),
        editorEmails: [],
        maintainerEmails: [],
        projectId: fixture.projectId,
      });
      await fixture.syncReplica();

      const events1 = await eventsPromise1;
      abortController1.abort();

      expect(events1).toHaveLength(1);
      expect(events1[0].configName).toBe('first-sub-config');

      // Second subscription after abort
      const abortController2 = new AbortController();

      const eventsPromise2 = collectEvents(
        fixture.edge.useCases.getProjectEvents(GLOBAL_CONTEXT, {
          projectId: fixture.projectId,
          environmentId: fixture.productionEnvironmentId,
          abortSignal: abortController2.signal,
        }),
        1,
      );

      await wait(50);

      await fixture.createConfig({
        name: 'second-sub-config',
        value: {sub: 2},
        schema: null,
        overrides: [],
        description: 'Second subscription config',
        identity: emailToIdentity(CURRENT_USER_EMAIL),
        editorEmails: [],
        maintainerEmails: [],
        projectId: fixture.projectId,
      });
      await fixture.syncReplica();

      const events2 = await eventsPromise2;
      abortController2.abort();

      expect(events2).toHaveLength(1);
      expect(events2[0].configName).toBe('second-sub-config');
    });

    it('should handle simultaneous subscriptions to different projects', async () => {
      // Create second project
      const {projectId: project2Id, environments: project2Envs} =
        await fixture.engine.useCases.createProject(GLOBAL_CONTEXT, {
          identity: emailToIdentity(CURRENT_USER_EMAIL),
          workspaceId: fixture.workspaceId,
          name: 'Second Test Project',
          description: 'Second project for simultaneous subscription testing',
        });

      const abortController1 = new AbortController();
      const abortController2 = new AbortController();

      // Subscribe to both projects
      const eventsPromise1 = collectEvents(
        fixture.edge.useCases.getProjectEvents(GLOBAL_CONTEXT, {
          projectId: fixture.projectId,
          environmentId: fixture.productionEnvironmentId,
          abortSignal: abortController1.signal,
        }),
        1,
      );

      const eventsPromise2 = collectEvents(
        fixture.edge.useCases.getProjectEvents(GLOBAL_CONTEXT, {
          projectId: project2Id,
          environmentId: project2Envs[0].id,
          abortSignal: abortController2.signal,
        }),
        1,
      );

      await fixture.syncReplica();
      await wait(50);

      // Create config in project 1
      await fixture.createConfig({
        name: 'project1-config',
        value: {project: 1},
        schema: null,
        overrides: [],
        description: 'Config in project 1',
        identity: emailToIdentity(CURRENT_USER_EMAIL),
        editorEmails: [],
        maintainerEmails: [],
        projectId: fixture.projectId,
      });
      await fixture.syncReplica();

      // Create config in project 2
      await fixture.engine.useCases.createConfig(GLOBAL_CONTEXT, {
        name: 'project2-config',
        description: 'Config in project 2',
        identity: emailToIdentity(CURRENT_USER_EMAIL),
        editorEmails: [],
        maintainerEmails: [],
        projectId: project2Id,
        defaultVariant: {
          value: asConfigValue({project: 2}),
          schema: null,
          overrides: [],
        },
        environmentVariants: project2Envs.map(env => ({
          environmentId: env.id,
          value: asConfigValue({project: 2}),
          schema: null,
          overrides: [],
          useBaseSchema: false,
        })),
      });
      await fixture.syncReplica();

      const events1 = await eventsPromise1;
      const events2 = await eventsPromise2;
      abortController1.abort();
      abortController2.abort();

      // Each subscription should only receive its project's events
      expect(events1).toHaveLength(1);
      expect(events1[0].configName).toBe('project1-config');

      expect(events2).toHaveLength(1);
      expect(events2[0].configName).toBe('project2-config');
    });
  });
});
