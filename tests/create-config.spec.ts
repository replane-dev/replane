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
      projectId: fixture.projectId,
    });

    await fixture.engine.useCases.patchProject(GLOBAL_CONTEXT, {
      currentUserEmail: CURRENT_USER_EMAIL,
      id: fixture.projectId,
      members: {users: [{email: 'some-other-user@example.com', role: 'owner'}]},
    });

    const {config} = await fixture.trpc.getConfig({
      name: 'new_config',
      projectId: fixture.projectId,
    });

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
        projectId: fixture.projectId,
      },
      editorEmails: [],
      ownerEmails: [],
      myRole: 'viewer',
      pendingProposals: [],
    } satisfies GetConfigResponse['config']);
  });

  it('should allow letters (any case), numbers and hyphen in name', async () => {
    const name = 'FeatureFlag-123';
    await fixture.engine.useCases.createConfig(GLOBAL_CONTEXT, {
      name,
      value: {enabled: true},
      schema: {type: 'object', properties: {enabled: {type: 'boolean'}}},
      description: 'Mixed case + digits + hyphen',
      currentUserEmail: CURRENT_USER_EMAIL,
      editorEmails: [],
      ownerEmails: [],
      projectId: fixture.projectId,
    });

    const {config} = await fixture.trpc.getConfig({name, projectId: fixture.projectId});
    expect(config?.config.name).toBe(name);
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
      projectId: fixture.projectId,
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
        projectId: fixture.projectId,
      }),
    ).rejects.toBeInstanceOf(BadRequestError);

    await fixture.engine.useCases.patchProject(GLOBAL_CONTEXT, {
      currentUserEmail: CURRENT_USER_EMAIL,
      id: fixture.projectId,
      members: {users: [{email: 'some-other-user@example.com', role: 'owner'}]},
    });

    const {config} = await fixture.trpc.getConfig({
      name: 'dup_config',
      projectId: fixture.projectId,
    });

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
        projectId: fixture.projectId,
      },
      editorEmails: [],
      ownerEmails: [],
      pendingProposals: [],
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
      projectId: fixture.projectId,
    });

    await fixture.engine.useCases.patchProject(GLOBAL_CONTEXT, {
      currentUserEmail: CURRENT_USER_EMAIL,
      id: fixture.projectId,
      members: {users: [{email: 'some-other-user@example.com', role: 'owner'}]},
    });

    const {config} = await fixture.trpc.getConfig({
      name: 'no_schema_config',
      projectId: fixture.projectId,
    });

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
        projectId: fixture.projectId,
      },
      editorEmails: [],
      ownerEmails: [],
      myRole: 'viewer',
      pendingProposals: [],
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
        projectId: fixture.projectId,
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
      projectId: fixture.projectId,
    });

    const {config} = await fixture.trpc.getConfig({
      name: 'config_with_members_owner',
      projectId: fixture.projectId,
    });
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
        projectId: fixture.projectId,
      },
      editorEmails: ['editor1@example.com', 'editor2@example.com'].map(normalizeEmail),
      ownerEmails: [CURRENT_USER_EMAIL, normalizeEmail('owner2@example.com')].sort(),
      myRole: 'owner',
      pendingProposals: [],
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
      projectId: fixture.projectId,
    });

    await fixture.engine.useCases.patchProject(GLOBAL_CONTEXT, {
      currentUserEmail: CURRENT_USER_EMAIL,
      id: fixture.projectId,
      members: {users: [{email: 'some-other-user@example.com', role: 'owner'}]},
    });

    const {config} = await fixture.trpc.getConfig({
      name: 'config_with_editor_role',
      projectId: fixture.projectId,
    });
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
        projectId: fixture.projectId,
      },
      editorEmails: [CURRENT_USER_EMAIL],
      ownerEmails: [normalizeEmail('other-owner@example.com')],
      myRole: 'editor',
      pendingProposals: [],
    } satisfies GetConfigResponse['config']);
  });

  it('creates audit message (config_created)', async () => {
    await fixture.engine.useCases.createConfig(GLOBAL_CONTEXT, {
      name: 'audit_config_created',
      value: 123,
      schema: {type: 'number'},
      description: 'audit test',
      currentUserEmail: CURRENT_USER_EMAIL,
      editorEmails: [],
      ownerEmails: [],
      projectId: fixture.projectId,
    });

    const messages = await fixture.engine.testing.auditMessages.list({
      lte: new Date('2100-01-01T00:00:00Z'),
      limit: 50,
      orderBy: 'created_at desc, id desc',
      projectId: fixture.projectId,
    });

    expect(messages.length).toBe(2); // including project_created
    const payload: any = messages[1].payload;
    expect(payload.type).toBe('config_created');
    expect(payload.config.name).toBe('audit_config_created');
    expect(payload.config.value).toBe(123);
    expect(payload.config.version).toBe(1);
    expect(payload.config.schema).toEqual({type: 'number'});
    expect(payload.config.description).toBe('audit test');
    // createdAt & updatedAt should be equal on creation
    expect(new Date(payload.config.createdAt).toISOString()).toBe(
      new Date(payload.config.updatedAt).toISOString(),
    );
  });

  it('should throw BadRequestError when user is in both editors and owners', async () => {
    const duplicateEmail = 'duplicate@example.com';

    await expect(
      fixture.engine.useCases.createConfig(GLOBAL_CONTEXT, {
        name: 'duplicate_user_config',
        value: {x: 1},
        schema: null,
        description: 'Test duplicate user',
        currentUserEmail: CURRENT_USER_EMAIL,
        editorEmails: [duplicateEmail, 'editor@example.com'],
        ownerEmails: [duplicateEmail, 'owner@example.com'],
        projectId: fixture.projectId,
      }),
    ).rejects.toThrow(BadRequestError);
  });

  it('should throw BadRequestError for duplicate users (case insensitive)', async () => {
    await expect(
      fixture.engine.useCases.createConfig(GLOBAL_CONTEXT, {
        name: 'case_insensitive_duplicate',
        value: {x: 1},
        schema: null,
        description: 'Test case insensitive duplicate',
        currentUserEmail: CURRENT_USER_EMAIL,
        editorEmails: ['User@Example.com'],
        ownerEmails: ['user@example.com'],
        projectId: fixture.projectId,
      }),
    ).rejects.toThrow(BadRequestError);
  });

  it('should throw BadRequestError for duplicate users in the same role', async () => {
    await expect(
      fixture.engine.useCases.createConfig(GLOBAL_CONTEXT, {
        name: 'case_insensitive_duplicate',
        value: {x: 1},
        schema: null,
        description: 'Test case insensitive duplicate',
        currentUserEmail: CURRENT_USER_EMAIL,
        editorEmails: ['User@Example.com', 'User@Example.com'],
        ownerEmails: [],
        projectId: fixture.projectId,
      }),
    ).rejects.toThrow(BadRequestError);
  });
});
