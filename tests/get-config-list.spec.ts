import {GLOBAL_CONTEXT} from '@/engine/core/context';
import type {GetConfigListResponse} from '@/engine/core/use-cases/get-config-list-use-case';
import {normalizeEmail, stringifyJsonc} from '@/engine/core/utils';
import type {ConfigSchema, ConfigValue} from '@/engine/core/zod';
import {describe, expect, it} from 'vitest';
import {useAppFixture} from './fixtures/app-fixture';

function asConfigValue(value: unknown): ConfigValue {
  return stringifyJsonc(value) as ConfigValue;
}

function asConfigSchema(value: unknown): ConfigSchema {
  return stringifyJsonc(value) as ConfigSchema;
}

const ADMIN_USER_EMAIL = normalizeEmail('admin@example.com');
const TEST_USER_EMAIL = normalizeEmail('test@example.com');

describe('getConfigList', () => {
  const fixture = useAppFixture({authEmail: ADMIN_USER_EMAIL});

  it('should return empty list when there are no configs', async () => {
    const {configs} = await fixture.trpc.getConfigList({projectId: fixture.projectId});

    expect(configs).toEqual([]);
  });

  it('should return all existing configs', async () => {
    // Register a non-admin user to test viewer role
    const testUserIdentity = await fixture.registerNonAdminWorkspaceMember(TEST_USER_EMAIL);

    await fixture.createConfig({
      overrides: [],
      name: 'first-config',
      value: asConfigValue('first-value'),
      schema: asConfigSchema({type: 'string'}),
      description: 'The first config',
      identity: fixture.identity,
      editorEmails: [],
      maintainerEmails: [],
      projectId: fixture.projectId,
    });
    await fixture.createConfig({
      overrides: [],
      name: 'second-config',
      value: asConfigValue({nested: 42}),
      schema: asConfigSchema({type: 'object', properties: {nested: {type: 'number'}}}),
      description: 'The second config',
      identity: fixture.identity,
      editorEmails: [],
      maintainerEmails: [],
      projectId: fixture.projectId,
    });

    // Fetch as the non-admin user
    const {configs} = await fixture.engine.useCases.getConfigList(GLOBAL_CONTEXT, {
      projectId: fixture.projectId,
      identity: testUserIdentity,
    });

    expect(configs).toEqual([
      {
        id: expect.any(String),
        name: 'first-config',
        createdAt: fixture.now,
        updatedAt: fixture.now,
        descriptionPreview: 'The first config',
        myRole: 'viewer',
        version: 1,
        projectId: fixture.projectId,
      },
      {
        id: expect.any(String),
        name: 'second-config',
        createdAt: fixture.now,
        updatedAt: fixture.now,
        descriptionPreview: 'The second config',
        myRole: 'viewer',
        version: 1,
        projectId: fixture.projectId,
      },
    ] satisfies GetConfigListResponse['configs']);
    expect(configs.length).toBe(2);
  });

  it('should include myRole correctly for viewer, editor, owner and be name ordered', async () => {
    // Register a non-admin user to test different roles
    const testUserIdentity = await fixture.registerNonAdminWorkspaceMember(TEST_USER_EMAIL);

    // maintainer role - user is config maintainer
    await fixture.createConfig({
      overrides: [],
      name: 'z_owner_config',
      value: asConfigValue(1),
      schema: asConfigSchema({type: 'number'}),
      description: 'Owner config',
      identity: fixture.identity,
      editorEmails: [],
      maintainerEmails: [TEST_USER_EMAIL],
      projectId: fixture.projectId,
    });
    // editor role - user is config editor
    await fixture.createConfig({
      overrides: [],
      name: 'm_editor_config',
      value: asConfigValue(2),
      schema: asConfigSchema({type: 'number'}),
      description: 'Editor config',
      identity: fixture.identity,
      editorEmails: [TEST_USER_EMAIL],
      maintainerEmails: ['someone@example.com'],
      projectId: fixture.projectId,
    });
    // viewer (no membership)
    await fixture.createConfig({
      overrides: [],
      name: 'a_viewer_config',
      value: asConfigValue(3),
      schema: asConfigSchema({type: 'number'}),
      description: 'Viewer config',
      identity: fixture.identity,
      editorEmails: [],
      maintainerEmails: ['someoneelse@example.com'],
      projectId: fixture.projectId,
    });

    // Fetch as the non-admin user
    const {configs} = await fixture.engine.useCases.getConfigList(GLOBAL_CONTEXT, {
      projectId: fixture.projectId,
      identity: testUserIdentity,
    });

    // Should be ordered by name ascending
    expect(configs.map(c => c.name)).toEqual([
      'a_viewer_config',
      'm_editor_config',
      'z_owner_config',
    ]);
    const roleMap = Object.fromEntries(configs.map(c => [c.name, c.myRole]));
    expect(roleMap).toEqual({
      a_viewer_config: 'viewer',
      m_editor_config: 'editor',
      z_owner_config: 'maintainer',
    });
  });

  it('should truncate description to 100 chars for descriptionPreview', async () => {
    const longDescription = 'x'.repeat(150);
    await fixture.createConfig({
      overrides: [],
      name: 'long_desc_config',
      value: asConfigValue('x'),
      schema: asConfigSchema({type: 'string'}),
      description: longDescription,
      identity: fixture.identity,
      editorEmails: [],
      maintainerEmails: [],
      projectId: fixture.projectId,
    });

    const {configs} = await fixture.trpc.getConfigList({projectId: fixture.projectId});
    const found = configs.find(c => c.name === 'long_desc_config');
    expect(found).toBeDefined();
    expect(found!.descriptionPreview.length).toBe(100);
    expect(found!.descriptionPreview).toBe(longDescription.substring(0, 100));
  });
});
