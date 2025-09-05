import {GLOBAL_CONTEXT} from '@/engine/core/context';
import type {GetConfigListResponse} from '@/engine/core/use-cases/get-config-list-use-case';
import {normalizeEmail} from '@/engine/core/utils';
import {describe} from 'node:test';
import {expect, it} from 'vitest';
import {useAppFixture} from './fixtures/trpc-fixture';

const TEST_USER_EMAIL = normalizeEmail('test@example.com');

describe('getConfigList', () => {
  const fixture = useAppFixture({authEmail: TEST_USER_EMAIL});

  it('should return empty list when there are no configs', async () => {
    const {configs} = await fixture.trpc.getConfigList();

    expect(configs).toEqual([]);
  });

  it('should return all existing configs', async () => {
    await fixture.engine.useCases.createConfig(GLOBAL_CONTEXT, {
      name: 'first-config',
      value: 'first-value',
      schema: {type: 'string'},
      description: 'The first config',
      currentUserEmail: TEST_USER_EMAIL,
      editorEmails: [],
      ownerEmails: [],
    });
    await fixture.engine.useCases.createConfig(GLOBAL_CONTEXT, {
      name: 'second-config',
      value: {nested: 42},
      schema: {type: 'object', properties: {nested: {type: 'number'}}},
      description: 'The second config',
      currentUserEmail: TEST_USER_EMAIL,
      editorEmails: [],
      ownerEmails: [],
    });

    const {configs} = await fixture.trpc.getConfigList();

    expect(configs).toEqual([
      {
        name: 'first-config',
        createdAt: fixture.now,
        updatedAt: fixture.now,
        descriptionPreview: 'The first config',
        myRole: 'viewer',
        version: 1,
      },
      {
        name: 'second-config',
        createdAt: fixture.now,
        updatedAt: fixture.now,
        descriptionPreview: 'The second config',
        myRole: 'viewer',
        version: 1,
      },
    ] satisfies GetConfigListResponse['configs']);
    expect(configs.length).toBe(2);
  });

  it('should include myRole correctly for viewer, editor, owner and be name ordered', async () => {
    // owner role
    await fixture.engine.useCases.createConfig(GLOBAL_CONTEXT, {
      name: 'z_owner_config',
      value: 1,
      schema: {type: 'number'},
      description: 'Owner config',
      currentUserEmail: TEST_USER_EMAIL,
      editorEmails: [],
      ownerEmails: [TEST_USER_EMAIL],
    });
    // editor role
    await fixture.engine.useCases.createConfig(GLOBAL_CONTEXT, {
      name: 'm_editor_config',
      value: 2,
      schema: {type: 'number'},
      description: 'Editor config',
      currentUserEmail: TEST_USER_EMAIL,
      editorEmails: [TEST_USER_EMAIL],
      ownerEmails: ['someone@example.com'],
    });
    // viewer (no membership)
    await fixture.engine.useCases.createConfig(GLOBAL_CONTEXT, {
      name: 'a_viewer_config',
      value: 3,
      schema: {type: 'number'},
      description: 'Viewer config',
      currentUserEmail: TEST_USER_EMAIL,
      editorEmails: [],
      ownerEmails: ['someoneelse@example.com'],
    });

    const {configs} = await fixture.trpc.getConfigList();
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
      z_owner_config: 'owner',
    });
  });

  it('should truncate description to 100 chars for descriptionPreview', async () => {
    const longDescription = 'x'.repeat(150);
    await fixture.engine.useCases.createConfig(GLOBAL_CONTEXT, {
      name: 'long_desc_config',
      value: 'v',
      schema: {type: 'string'},
      description: longDescription,
      currentUserEmail: TEST_USER_EMAIL,
      editorEmails: [],
      ownerEmails: [],
    });

    const {configs} = await fixture.trpc.getConfigList();
    const found = configs.find(c => c.name === 'long_desc_config');
    expect(found).toBeDefined();
    expect(found!.descriptionPreview.length).toBe(100);
    expect(found!.descriptionPreview).toBe(longDescription.substring(0, 100));
  });
});
