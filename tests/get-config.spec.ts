import {GLOBAL_CONTEXT} from '@/engine/core/context';
import type {GetConfigResponse} from '@/engine/core/use-cases/get-config-use-case';
import {normalizeEmail} from '@/engine/core/utils';
import {describe, expect, it} from 'vitest';
import {TEST_USER_ID, useAppFixture} from './fixtures/trpc-fixture';

const TEST_USER_EMAIL = normalizeEmail('test@example.com');

describe('getConfig', () => {
  const fixture = useAppFixture({authEmail: TEST_USER_EMAIL});

  it('should return requested config', async () => {
    await fixture.engine.useCases.createConfig(GLOBAL_CONTEXT, {
      name: 'test-config',
      value: 'test-value',
      schema: {type: 'string'},
      description: 'A test config',
      currentUserEmail: TEST_USER_EMAIL,
      editorEmails: [],
      ownerEmails: [],
      projectId: fixture.projectId,
    });

    await fixture.engine.useCases.patchProject(GLOBAL_CONTEXT, {
      currentUserEmail: TEST_USER_EMAIL,
      id: fixture.projectId,
      members: {users: [{email: 'some-other-user@example.com', role: 'owner'}]},
    });
    const {config} = await fixture.trpc.getConfig({
      name: 'test-config',
      projectId: fixture.projectId,
    });

    expect(config).toEqual({
      config: {
        name: 'test-config',
        value: 'test-value',
        createdAt: fixture.now,
        updatedAt: fixture.now,
        schema: {type: 'string'},
        description: 'A test config',
        creatorId: TEST_USER_ID,
        id: expect.any(String),
        version: 1,
        projectId: fixture.projectId,
      },
      editorEmails: [],
      myRole: 'viewer',
      ownerEmails: [],
    } satisfies GetConfigResponse['config']);
  });

  it('should return undefined if config does not exist', async () => {
    const {config} = await fixture.trpc.getConfig({
      name: 'non-existent-config',
      projectId: fixture.projectId,
    });

    expect(config).toBeUndefined();
  });

  it('should reflect owner role and owner/editor lists', async () => {
    await fixture.engine.useCases.createConfig(GLOBAL_CONTEXT, {
      name: 'owner-role-config',
      value: 'x',
      schema: {type: 'string'},
      description: 'Owner role',
      currentUserEmail: TEST_USER_EMAIL,
      editorEmails: ['editor@example.com'],
      ownerEmails: [TEST_USER_EMAIL, 'owner2@example.com'],
      projectId: fixture.projectId,
    });
    const {config} = await fixture.trpc.getConfig({
      name: 'owner-role-config',
      projectId: fixture.projectId,
    });
    expect(config?.myRole).toBe('owner');
    expect(config?.ownerEmails.sort()).toEqual(
      [
        TEST_USER_EMAIL,
        expect.any(String), // normalized email of owner2
      ].sort(),
    );
    expect(config?.editorEmails).toEqual(['editor@example.com']);
  });

  it('should reflect editor role', async () => {
    await fixture.engine.useCases.createConfig(GLOBAL_CONTEXT, {
      name: 'editor-role-config',
      value: 'x',
      schema: {type: 'string'},
      description: 'Editor role',
      currentUserEmail: TEST_USER_EMAIL,
      editorEmails: [TEST_USER_EMAIL],
      ownerEmails: ['another-owner@example.com'],
      projectId: fixture.projectId,
    });

    await fixture.engine.useCases.patchProject(GLOBAL_CONTEXT, {
      currentUserEmail: TEST_USER_EMAIL,
      id: fixture.projectId,
      members: {users: [{email: 'some-other-user@example.com', role: 'owner'}]},
    });
    const {config} = await fixture.trpc.getConfig({
      name: 'editor-role-config',
      projectId: fixture.projectId,
    });
    expect(config?.myRole).toBe('editor');
    expect(config?.editorEmails).toContain(TEST_USER_EMAIL);
  });

  it('should reflect viewer role when not a member', async () => {
    await fixture.engine.useCases.createConfig(GLOBAL_CONTEXT, {
      name: 'viewer-role-config',
      value: 'x',
      schema: {type: 'string'},
      description: 'Viewer role',
      currentUserEmail: TEST_USER_EMAIL,
      editorEmails: [],
      ownerEmails: ['different-owner@example.com'],
      projectId: fixture.projectId,
    });

    await fixture.engine.useCases.patchProject(GLOBAL_CONTEXT, {
      currentUserEmail: TEST_USER_EMAIL,
      id: fixture.projectId,
      members: {users: [{email: 'some-other-user@example.com', role: 'owner'}]},
    });
    const {config} = await fixture.trpc.getConfig({
      name: 'viewer-role-config',
      projectId: fixture.projectId,
    });
    expect(config?.myRole).toBe('viewer');
  });
});
