import {GLOBAL_CONTEXT} from '@/engine/core/context';
import type {GetConfigListResponse} from '@/engine/core/use-cases/get-config-list-use-case';
import {normalizeEmail} from '@/engine/core/utils';
import {describe, expect, it} from 'vitest';
import {useAppFixture} from './fixtures/app-fixture';

const TEST_USER_EMAIL = normalizeEmail('test@example.com');

describe('getConfigList', () => {
  const fixture = useAppFixture({authEmail: TEST_USER_EMAIL});

  it('should return empty list when there are no configs', async () => {
    const {configs} = await fixture.trpc.getConfigList({projectId: fixture.projectId});

    expect(configs).toEqual([]);
  });

  it('should return all existing configs', async () => {
    await fixture.createConfig({
      overrides: [],
      name: 'first-config',
      value: 'first-value',
      schema: {type: 'string'},
      description: 'The first config',
      identity: await fixture.emailToIdentity(TEST_USER_EMAIL),
      editorEmails: [],
      maintainerEmails: [],
      projectId: fixture.projectId,
    });
    await fixture.createConfig({
      overrides: [],
      name: 'second-config',
      value: {nested: 42},
      schema: {type: 'object', properties: {nested: {type: 'number'}}},
      description: 'The second config',
      identity: await fixture.emailToIdentity(TEST_USER_EMAIL),
      editorEmails: [],
      maintainerEmails: [],
      projectId: fixture.projectId,
    });

    await fixture.engine.useCases.patchProject(GLOBAL_CONTEXT, {
      identity: await fixture.emailToIdentity(TEST_USER_EMAIL),
      id: fixture.projectId,
      members: {users: [{email: 'some-other-user@example.com', role: 'admin'}]},
    });

    const {configs} = await fixture.trpc.getConfigList({projectId: fixture.projectId});

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
    // owner role
    await fixture.createConfig({
      overrides: [],
      name: 'z_owner_config',
      value: 1,
      schema: {type: 'number'},
      description: 'Owner config',
      identity: await fixture.emailToIdentity(TEST_USER_EMAIL),
      editorEmails: [],
      maintainerEmails: [TEST_USER_EMAIL],
      projectId: fixture.projectId,
    });
    // editor role
    await fixture.createConfig({
      overrides: [],
      name: 'm_editor_config',
      value: 2,
      schema: {type: 'number'},
      description: 'Editor config',
      identity: await fixture.emailToIdentity(TEST_USER_EMAIL),
      editorEmails: [TEST_USER_EMAIL],
      maintainerEmails: ['someone@example.com'],
      projectId: fixture.projectId,
    });
    // viewer (no membership)
    await fixture.createConfig({
      overrides: [],
      name: 'a_viewer_config',
      value: 3,
      schema: {type: 'number'},
      description: 'Viewer config',
      identity: await fixture.emailToIdentity(TEST_USER_EMAIL),
      editorEmails: [],
      maintainerEmails: ['someoneelse@example.com'],
      projectId: fixture.projectId,
    });

    await fixture.engine.useCases.patchProject(GLOBAL_CONTEXT, {
      identity: await fixture.emailToIdentity(TEST_USER_EMAIL),
      id: fixture.projectId,
      members: {users: [{email: 'some-other-user@example.com', role: 'admin'}]},
    });

    const {configs} = await fixture.trpc.getConfigList({projectId: fixture.projectId});
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
      value: 'v',
      schema: {type: 'string'},
      description: longDescription,
      identity: await fixture.emailToIdentity(TEST_USER_EMAIL),
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
