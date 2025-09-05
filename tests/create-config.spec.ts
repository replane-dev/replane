import {GLOBAL_CONTEXT} from '@/engine/core/context';
import {BadRequestError} from '@/engine/core/errors';
import type {GetConfigResponse} from '@/engine/core/use-cases/get-config-use-case';
import {normalizeEmail} from '@/engine/core/utils';
import {describe, expect, it} from 'vitest';
import {TEST_USER_ID, useAppFixture} from './fixtures/trpc-fixture';

const CURRENT_USER_EMAIL = normalizeEmail('test@example.com');

describe('createConfig', () => {
  const fixture = useAppFixture({authEmail: CURRENT_USER_EMAIL});

  it('should create a new config', async () => {
    await fixture.engine.useCases.createConfig(GLOBAL_CONTEXT, {
      name: 'new_config',
      value: {flag: true},
      schema: {type: 'object', properties: {flag: {type: 'boolean'}}},
      description: 'A new config for testing',
      currentUserEmail: CURRENT_USER_EMAIL,
      editorEmails: [],
      ownerEmails: [],
    });

    const {config} = await fixture.trpc.getConfig({name: 'new_config'});

    expect(config).toEqual({
      config: {
        name: 'new_config',
        value: {flag: true},
        schema: {type: 'object', properties: {flag: {type: 'boolean'}}},
        createdAt: fixture.now,
        updatedAt: fixture.now,
        description: 'A new config for testing',
        creatorId: TEST_USER_ID,
        id: expect.any(String),
        version: 1,
      },
      editorEmails: [],
      ownerEmails: [],
      myRole: 'viewer',
    } satisfies GetConfigResponse['config']);
  });

  it('should throw BadRequestError when config with this name already exists', async () => {
    await fixture.engine.useCases.createConfig(GLOBAL_CONTEXT, {
      name: 'dup_config',
      value: 'v1',
      schema: {type: 'string'},
      description: 'A duplicate config for testing v1',
      currentUserEmail: CURRENT_USER_EMAIL,
      editorEmails: [],
      ownerEmails: [],
    });

    await expect(
      fixture.engine.useCases.createConfig(GLOBAL_CONTEXT, {
        name: 'dup_config',
        value: 'v2',
        schema: {type: 'string'},
        description: 'A duplicate config for testing v2',
        currentUserEmail: CURRENT_USER_EMAIL,
        editorEmails: [],
        ownerEmails: [],
      }),
    ).rejects.toBeInstanceOf(BadRequestError);

    const {config} = await fixture.trpc.getConfig({name: 'dup_config'});

    expect(config).toEqual({
      config: {
        name: 'dup_config',
        value: 'v1',
        schema: {type: 'string'},
        createdAt: fixture.now,
        updatedAt: fixture.now,
        description: 'A duplicate config for testing v1',
        creatorId: TEST_USER_ID,
        id: expect.any(String),
        version: 1,
      },
      editorEmails: [],
      ownerEmails: [],
      myRole: 'viewer',
    } satisfies GetConfigResponse['config']);
  });

  it('should accept config without a schema', async () => {
    await fixture.engine.useCases.createConfig(GLOBAL_CONTEXT, {
      name: 'no_schema_config',
      value: 'v1',
      schema: null,
      description: 'A config without a schema',
      currentUserEmail: CURRENT_USER_EMAIL,
      editorEmails: [],
      ownerEmails: [],
    });

    const {config} = await fixture.trpc.getConfig({name: 'no_schema_config'});

    expect(config).toEqual({
      config: {
        name: 'no_schema_config',
        value: 'v1',
        schema: null,
        createdAt: fixture.now,
        updatedAt: fixture.now,
        description: 'A config without a schema',
        creatorId: TEST_USER_ID,
        id: expect.any(String),
        version: 1,
      },
      editorEmails: [],
      ownerEmails: [],
      myRole: 'viewer',
    } satisfies GetConfigResponse['config']);
  });

  it('should reject creation when value does not match schema', async () => {
    await expect(
      fixture.engine.useCases.createConfig(GLOBAL_CONTEXT, {
        name: 'schema_mismatch_on_create',
        value: {flag: 'not_boolean'},
        schema: {type: 'object', properties: {flag: {type: 'boolean'}}},
        description: 'Invalid create schema',
        currentUserEmail: CURRENT_USER_EMAIL,
        editorEmails: [],
        ownerEmails: [],
      }),
    ).rejects.toBeInstanceOf(BadRequestError);
  });

  it('should create config with members and set myRole=owner', async () => {
    await fixture.engine.useCases.createConfig(GLOBAL_CONTEXT, {
      name: 'config_with_members_owner',
      value: 1,
      schema: {type: 'number'},
      description: 'Members test owner',
      currentUserEmail: CURRENT_USER_EMAIL,
      editorEmails: ['editor1@example.com', 'editor2@example.com'],
      ownerEmails: [CURRENT_USER_EMAIL, 'owner2@example.com'],
    });

    const {config} = await fixture.trpc.getConfig({name: 'config_with_members_owner'});
    expect(config).toBeDefined();
    // Structural checks (excluding ownerEmails order)
    expect(config).toEqual({
      config: {
        name: 'config_with_members_owner',
        value: 1,
        schema: {type: 'number'},
        description: 'Members test owner',
        createdAt: fixture.now,
        updatedAt: fixture.now,
        creatorId: TEST_USER_ID,
        id: expect.any(String),
        version: 1,
      },
      editorEmails: ['editor1@example.com', 'editor2@example.com'].map(normalizeEmail),
      ownerEmails: [CURRENT_USER_EMAIL, normalizeEmail('owner2@example.com')].sort(),
      myRole: 'owner',
    } satisfies GetConfigResponse['config']);
  });

  it('should set myRole=editor when current user only an editor', async () => {
    await fixture.engine.useCases.createConfig(GLOBAL_CONTEXT, {
      name: 'config_with_editor_role',
      value: 'x',
      schema: {type: 'string'},
      description: 'Members test editor',
      currentUserEmail: CURRENT_USER_EMAIL,
      editorEmails: [CURRENT_USER_EMAIL],
      ownerEmails: ['other-owner@example.com'],
    });

    const {config} = await fixture.trpc.getConfig({name: 'config_with_editor_role'});
    expect(config).toEqual({
      config: {
        name: 'config_with_editor_role',
        value: 'x',
        schema: {type: 'string'},
        description: 'Members test editor',
        createdAt: fixture.now,
        updatedAt: fixture.now,
        creatorId: TEST_USER_ID,
        id: expect.any(String),
        version: 1,
      },
      editorEmails: [CURRENT_USER_EMAIL],
      ownerEmails: [normalizeEmail('other-owner@example.com')],
      myRole: 'editor',
    } satisfies GetConfigResponse['config']);
  });
});
