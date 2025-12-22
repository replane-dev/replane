import {GLOBAL_CONTEXT} from '@/engine/core/context';
import {BadRequestError} from '@/engine/core/errors';
import {normalizeEmail} from '@/engine/core/utils';
import {describe, expect, it} from 'vitest';
import {emailToIdentity, TEST_USER_ID, useAppFixture} from './fixtures/trpc-fixture';

const CURRENT_USER_EMAIL = normalizeEmail('test@example.com');

describe('createConfig', () => {
  const fixture = useAppFixture({authEmail: CURRENT_USER_EMAIL});

  it('should create a new config', async () => {
    const {configId} = await fixture.createConfig({
      overrides: [],
      name: 'new_config',
      value: {flag: true},
      schema: {type: 'object', properties: {flag: {type: 'boolean'}}},
      description: 'A new config for testing',
      identity: emailToIdentity(CURRENT_USER_EMAIL),
      editorEmails: [],
      maintainerEmails: [],
      projectId: fixture.projectId,
    });

    const {config} = await fixture.trpc.getConfig({
      name: 'new_config',
      projectId: fixture.projectId,
    });

    expect(config).toBeDefined();
    expect(config?.config.name).toBe('new_config');
    expect(config?.config.description).toBe('A new config for testing');
    expect(config?.config.id).toBe(configId);
    expect(config?.config.version).toBe(1);
    expect(config?.config.projectId).toBe(fixture.projectId);

    // Variants should exist
    expect(config?.variants).toHaveLength(2); // Production and Development
    const productionVariant = config?.variants.find(v => v.environmentName === 'Production');
    expect(productionVariant).toBeDefined();
    expect(productionVariant?.value).toEqual({flag: true});
    expect(productionVariant?.schema).toEqual({type: 'object', properties: {flag: {type: 'boolean'}}});
    expect(productionVariant?.overrides).toEqual([]);
  });

  it('should allow letters (any case), numbers and hyphen in name', async () => {
    const name = 'FeatureFlag-123';
    await fixture.createConfig({
      overrides: [],
      name,
      value: {enabled: true},
      schema: {type: 'object', properties: {enabled: {type: 'boolean'}}},
      description: 'Mixed case + digits + hyphen',
      identity: emailToIdentity(CURRENT_USER_EMAIL),
      editorEmails: [],
      maintainerEmails: [],
      projectId: fixture.projectId,
    });

    const {config} = await fixture.trpc.getConfig({name, projectId: fixture.projectId});
    expect(config?.config.name).toBe(name);
  });

  it('should throw BadRequestError when config with this name already exists', async () => {
    await fixture.createConfig({
      overrides: [],
      name: 'dup_config',
      value: 'v1',
      schema: {type: 'string'},
      description: 'A duplicate config for testing v1',
      identity: emailToIdentity(CURRENT_USER_EMAIL),
      editorEmails: [],
      maintainerEmails: [],
      projectId: fixture.projectId,
    });

    await expect(
      fixture.createConfig({
        overrides: [],
        name: 'dup_config',
        value: 'v2',
        schema: {type: 'string'},
        description: 'A duplicate config for testing v2',
        identity: emailToIdentity(CURRENT_USER_EMAIL),
        editorEmails: [],
        maintainerEmails: [],
        projectId: fixture.projectId,
      }),
    ).rejects.toBeInstanceOf(BadRequestError);

    const {config} = await fixture.trpc.getConfig({
      name: 'dup_config',
      projectId: fixture.projectId,
    });

    expect(config?.config.name).toBe('dup_config');
    expect(config?.config.description).toBe('A duplicate config for testing v1');
    const productionVariant = config?.variants.find(v => v.environmentName === 'Production');
    expect(productionVariant?.value).toBe('v1');
  });

  it('should accept config without a schema', async () => {
    await fixture.createConfig({
      overrides: [],
      name: 'no_schema_config',
      value: 'v1',
      schema: null,
      description: 'A config without a schema',
      identity: emailToIdentity(CURRENT_USER_EMAIL),
      editorEmails: [],
      maintainerEmails: [],
      projectId: fixture.projectId,
    });

    const {config} = await fixture.trpc.getConfig({
      name: 'no_schema_config',
      projectId: fixture.projectId,
    });

    expect(config?.config.name).toBe('no_schema_config');
    const productionVariant = config?.variants.find(v => v.environmentName === 'Production');
    expect(productionVariant?.value).toBe('v1');
    expect(productionVariant?.schema).toBeNull();
  });

  it('should reject creation when value does not match schema', async () => {
    await expect(
      fixture.createConfig({
        overrides: [],
        name: 'schema_mismatch_on_create',
        value: {flag: 'not_boolean'},
        schema: {type: 'object', properties: {flag: {type: 'boolean'}}},
        description: 'Invalid create schema',
        identity: emailToIdentity(CURRENT_USER_EMAIL),
        editorEmails: [],
        maintainerEmails: [],
        projectId: fixture.projectId,
      }),
    ).rejects.toBeInstanceOf(BadRequestError);
  });

  it('should create config with members and set myRole=maintainer', async () => {
    await fixture.createConfig({
      overrides: [],
      name: 'config_with_members_owner',
      value: 1,
      schema: {type: 'number'},
      description: 'Members test owner',
      identity: emailToIdentity(CURRENT_USER_EMAIL),
      editorEmails: ['editor1@example.com', 'editor2@example.com'],
      maintainerEmails: [CURRENT_USER_EMAIL, 'owner2@example.com'],
      projectId: fixture.projectId,
    });

    const {config} = await fixture.trpc.getConfig({
      name: 'config_with_members_owner',
      projectId: fixture.projectId,
    });
    expect(config).toBeDefined();
    expect(config?.config.name).toBe('config_with_members_owner');
    expect(config?.editorEmails).toEqual(['editor1@example.com', 'editor2@example.com'].map(normalizeEmail));
    expect(config?.maintainerEmails.sort()).toEqual(
      [CURRENT_USER_EMAIL, normalizeEmail('owner2@example.com')].sort(),
    );
    expect(config?.myRole).toBe('maintainer');
    const productionVariant = config?.variants.find(v => v.environmentName === 'Production');
    expect(productionVariant?.value).toBe(1);
  });

  it('should set myRole=editor when current user only an editor', async () => {
    await fixture.createConfig({
      overrides: [],
      name: 'config_with_editor_role',
      value: 'x',
      schema: {type: 'string'},
      description: 'Members test editor',
      identity: emailToIdentity(CURRENT_USER_EMAIL),
      editorEmails: [CURRENT_USER_EMAIL],
      maintainerEmails: ['other-owner@example.com'],
      projectId: fixture.projectId,
    });

    await fixture.engine.useCases.patchProject(GLOBAL_CONTEXT, {
      identity: emailToIdentity(CURRENT_USER_EMAIL),
      id: fixture.projectId,
      members: {users: [{email: 'some-other-user@example.com', role: 'admin'}]},
    });

    const {config} = await fixture.trpc.getConfig({
      name: 'config_with_editor_role',
      projectId: fixture.projectId,
    });
    expect(config?.config.name).toBe('config_with_editor_role');
    expect(config?.editorEmails).toEqual([CURRENT_USER_EMAIL]);
    expect(config?.maintainerEmails).toEqual([normalizeEmail('other-owner@example.com')]);
    expect(config?.myRole).toBe('editor');
    const productionVariant = config?.variants.find(v => v.environmentName === 'Production');
    expect(productionVariant?.value).toBe('x');
  });

  it('creates audit message (config_created)', async () => {
    await fixture.createConfig({
      overrides: [],
      name: 'audit_config_created',
      value: 123,
      schema: {type: 'number'},
      description: 'audit test',
      identity: emailToIdentity(CURRENT_USER_EMAIL),
      editorEmails: [],
      maintainerEmails: [],
      projectId: fixture.projectId,
    });

    const messages = await fixture.engine.testing.auditLogs.list({
      lte: new Date('2100-01-01T00:00:00Z'),
      limit: 50,
      orderBy: 'created_at desc, id desc',
      projectId: fixture.projectId,
    });

    // Find the config_created message
    const configCreatedMsg = messages.find(m => m.payload.type === 'config_created');
    expect(configCreatedMsg).toBeDefined();
    const payload: any = configCreatedMsg!.payload;
    expect(payload.type).toBe('config_created');
    expect(payload.config.name).toBe('audit_config_created');
    expect(payload.config.description).toBe('audit test');
  });

  it('should throw BadRequestError when user is in both editors and owners', async () => {
    const duplicateEmail = 'duplicate@example.com';

    await expect(
      fixture.createConfig({
        overrides: [],
        name: 'duplicate_user_config',
        value: {x: 1},
        schema: null,
        description: 'Test duplicate user',
        identity: emailToIdentity(CURRENT_USER_EMAIL),
        editorEmails: [duplicateEmail, 'editor@example.com'],
        maintainerEmails: [duplicateEmail, 'owner@example.com'],
        projectId: fixture.projectId,
      }),
    ).rejects.toThrow(BadRequestError);
  });

  it('should throw BadRequestError for duplicate users (case insensitive)', async () => {
    await expect(
      fixture.createConfig({
        overrides: [],
        name: 'case_insensitive_duplicate',
        value: {x: 1},
        schema: null,
        description: 'Test case insensitive duplicate',
        identity: emailToIdentity(CURRENT_USER_EMAIL),
        editorEmails: ['User@Example.com'],
        maintainerEmails: ['user@example.com'],
        projectId: fixture.projectId,
      }),
    ).rejects.toThrow(BadRequestError);
  });

  it('should throw BadRequestError for duplicate users in the same role', async () => {
    await expect(
      fixture.createConfig({
        overrides: [],
        name: 'case_insensitive_duplicate',
        value: {x: 1},
        schema: null,
        description: 'Test case insensitive duplicate',
        identity: emailToIdentity(CURRENT_USER_EMAIL),
        editorEmails: ['User@Example.com', 'User@Example.com'],
        maintainerEmails: [],
        projectId: fixture.projectId,
      }),
    ).rejects.toThrow(BadRequestError);
  });

  it('should create config variants for each environment', async () => {
    const {configId} = await fixture.createConfig({
      overrides: [],
      name: 'variant_per_env_config',
      value: {x: 1},
      schema: null,
      description: 'Test',
      identity: emailToIdentity(CURRENT_USER_EMAIL),
      editorEmails: [],
      maintainerEmails: [CURRENT_USER_EMAIL],
      projectId: fixture.projectId,
    });

    // Verify variants were created for each environment
    const variants = await fixture.engine.testing.configVariants.getByConfigId(configId);
    expect(variants).toHaveLength(2); // Production and Development

    const productionVariant = variants.find(v => v.environmentId === fixture.productionEnvironmentId);
    const developmentVariant = variants.find(v => v.environmentId === fixture.developmentEnvironmentId);

    expect(productionVariant).toBeDefined();
    expect(developmentVariant).toBeDefined();
    expect(productionVariant?.value).toEqual({x: 1});
    expect(developmentVariant?.value).toEqual({x: 1});
  });
});
