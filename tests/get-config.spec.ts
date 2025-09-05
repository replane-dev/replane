import {GLOBAL_CONTEXT} from '@/engine/core/context';
import type {GetConfigResponse} from '@/engine/core/use-cases/get-config-use-case';
import {normalizeEmail} from '@/engine/core/utils';
import {describe} from 'node:test';
import {expect, it} from 'vitest';
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
    });
    const {config} = await fixture.trpc.getConfig({name: 'test-config'});

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
      },
      editorEmails: [],
      myRole: 'viewer',
      ownerEmails: [],
    } satisfies GetConfigResponse['config']);
  });

  it('should return undefined if config does not exist', async () => {
    const {config} = await fixture.trpc.getConfig({name: 'non-existent-config'});

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
    });
    const {config} = await fixture.trpc.getConfig({name: 'owner-role-config'});
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
    });
    const {config} = await fixture.trpc.getConfig({name: 'editor-role-config'});
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
    });
    const {config} = await fixture.trpc.getConfig({name: 'viewer-role-config'});
    expect(config?.myRole).toBe('viewer');
  });
});
