import type {
  ConfigMembersChangedAuditMessagePayload,
  ConfigUpdatedAuditMessagePayload,
} from '@/engine/core/audit-message-store';
import {GLOBAL_CONTEXT} from '@/engine/core/context';
import {BadRequestError, ForbiddenError} from '@/engine/core/errors';
import type {GetConfigResponse} from '@/engine/core/use-cases/get-config-use-case';
import {normalizeEmail} from '@/engine/core/utils';
import {describe, expect, it} from 'vitest';
import {TEST_USER_ID, useAppFixture} from './fixtures/trpc-fixture';

const CURRENT_USER_EMAIL = normalizeEmail('test@example.com');

// Additional emails for membership tests
const OTHER_EDITOR_EMAIL = normalizeEmail('other-editor@example.com');
const NEW_EDITOR_EMAIL = normalizeEmail('new-editor@example.com');

describe('patchConfig', () => {
  const fixture = useAppFixture({authEmail: CURRENT_USER_EMAIL});

  it('should patch value and description (editor permission)', async () => {
    const {configId} = await fixture.engine.useCases.createConfig(GLOBAL_CONTEXT, {
      name: 'patch_basic',
      value: {flag: true},
      schema: {type: 'object', properties: {flag: {type: 'boolean'}}},
      description: 'Initial description',
      currentUserEmail: CURRENT_USER_EMAIL,
      editorEmails: [CURRENT_USER_EMAIL],
      ownerEmails: [],
      projectId: fixture.projectId,
    });

    // capture initial creation time before advancing time
    const initialDate = fixture.now;
    const nextDate = new Date('2020-01-02T00:00:00Z');
    fixture.setNow(nextDate); // affects updatedAt only

    await fixture.engine.useCases.patchConfig(GLOBAL_CONTEXT, {
      configId,
      value: {newValue: {flag: false}},
      description: {newDescription: 'Updated description'},
      currentUserEmail: CURRENT_USER_EMAIL,
      prevVersion: 1,
    });

    await fixture.engine.useCases.patchProject(GLOBAL_CONTEXT, {
      currentUserEmail: CURRENT_USER_EMAIL,
      id: fixture.projectId,
      members: {users: [{email: 'some-other-user@example.com', role: 'owner'}]},
    });

    const {config} = await fixture.trpc.getConfig({
      name: 'patch_basic',
      projectId: fixture.projectId,
    });

    expect(config).toEqual({
      config: {
        name: 'patch_basic',
        value: {flag: false},
        schema: {type: 'object', properties: {flag: {type: 'boolean'}}},
        description: 'Updated description',
        createdAt: initialDate, // unchanged
        updatedAt: fixture.now, // advanced date
        creatorId: TEST_USER_ID,
        id: expect.any(String),
        version: 2,
        projectId: fixture.projectId,
      },
      editorEmails: [CURRENT_USER_EMAIL],
      ownerEmails: [],
      myRole: 'editor',
    } satisfies GetConfigResponse['config']);
  });

  it('should patch schema and value when both valid', async () => {
    const {configId} = await fixture.engine.useCases.createConfig(GLOBAL_CONTEXT, {
      name: 'patch_schema',
      value: {count: 1},
      schema: {type: 'object', properties: {count: {type: 'number'}}},
      description: 'Schema test',
      currentUserEmail: CURRENT_USER_EMAIL,
      editorEmails: [],
      ownerEmails: [CURRENT_USER_EMAIL], // need manage permission to change schema
      projectId: fixture.projectId,
    });

    fixture.setNow(new Date('2020-01-03T00:00:00Z'));

    await fixture.engine.useCases.patchConfig(GLOBAL_CONTEXT, {
      configId,
      value: {newValue: {count: 2, extra: 'ok'}},
      schema: {
        newSchema: {type: 'object', properties: {count: {type: 'number'}, extra: {type: 'string'}}},
      },
      currentUserEmail: CURRENT_USER_EMAIL,
      prevVersion: 1,
    });

    const {config} = await fixture.trpc.getConfig({
      name: 'patch_schema',
      projectId: fixture.projectId,
    });
    expect(config?.config.version).toBe(2);
    expect(config?.config.value).toEqual({count: 2, extra: 'ok'});
    expect(config?.config.schema).toEqual({
      type: 'object',
      properties: {count: {type: 'number'}, extra: {type: 'string'}},
    });
  });

  it('should fail when provided value does not match new schema', async () => {
    const {configId} = await fixture.engine.useCases.createConfig(GLOBAL_CONTEXT, {
      name: 'patch_schema_invalid',
      value: {flag: true},
      schema: {type: 'object', properties: {flag: {type: 'boolean'}}},
      description: 'Invalid schema test',
      currentUserEmail: CURRENT_USER_EMAIL,
      editorEmails: [],
      ownerEmails: [CURRENT_USER_EMAIL], // need manage permission to change schema
      projectId: fixture.projectId,
    });

    await expect(
      fixture.engine.useCases.patchConfig(GLOBAL_CONTEXT, {
        configId,
        value: {newValue: {flag: 'nope'}},
        schema: {newSchema: {type: 'object', properties: {flag: {type: 'boolean'}}}},
        currentUserEmail: CURRENT_USER_EMAIL,
        prevVersion: 1,
      }),
    ).rejects.toBeInstanceOf(BadRequestError);
  });

  it('should fail with version mismatch', async () => {
    const {configId} = await fixture.engine.useCases.createConfig(GLOBAL_CONTEXT, {
      name: 'patch_version_conflict',
      value: 1,
      schema: {type: 'number'},
      description: 'Version conflict test',
      currentUserEmail: CURRENT_USER_EMAIL,
      editorEmails: [CURRENT_USER_EMAIL],
      ownerEmails: [],
      projectId: fixture.projectId,
    });

    await expect(
      fixture.engine.useCases.patchConfig(GLOBAL_CONTEXT, {
        configId,
        value: {newValue: 2},
        currentUserEmail: CURRENT_USER_EMAIL,
        prevVersion: 999, // wrong prev version
      }),
    ).rejects.toBeInstanceOf(BadRequestError);
  });

  it('should enforce manage permission when changing members', async () => {
    const {configId: editorOnlyId} = await fixture.engine.useCases.createConfig(GLOBAL_CONTEXT, {
      name: 'patch_members_forbidden',
      value: 'v',
      schema: {type: 'string'},
      description: 'Members perm test',
      currentUserEmail: CURRENT_USER_EMAIL,
      editorEmails: [CURRENT_USER_EMAIL],
      ownerEmails: [],
      projectId: fixture.projectId,
    });

    await fixture.engine.useCases.patchProject(GLOBAL_CONTEXT, {
      currentUserEmail: CURRENT_USER_EMAIL,
      id: fixture.projectId,
      members: {users: [{email: 'some-other-user@example.com', role: 'owner'}]},
    });

    await expect(
      fixture.engine.useCases.patchConfig(GLOBAL_CONTEXT, {
        configId: editorOnlyId,
        members: {newMembers: [{email: CURRENT_USER_EMAIL, role: 'editor'}]},
        currentUserEmail: CURRENT_USER_EMAIL,
        prevVersion: 1,
      }),
    ).rejects.toBeInstanceOf(ForbiddenError);
  });

  it('should update members (add & remove) when user is owner', async () => {
    const {configId} = await fixture.engine.useCases.createConfig(GLOBAL_CONTEXT, {
      name: 'patch_members_success',
      value: 'v1',
      schema: {type: 'string'},
      description: 'Members success test',
      currentUserEmail: CURRENT_USER_EMAIL,
      editorEmails: [OTHER_EDITOR_EMAIL],
      ownerEmails: [CURRENT_USER_EMAIL],
      projectId: fixture.projectId,
    });

    // Remove OTHER_EDITOR_EMAIL, add NEW_EDITOR_EMAIL
    await fixture.engine.useCases.patchConfig(GLOBAL_CONTEXT, {
      configId,
      members: {
        newMembers: [
          {email: CURRENT_USER_EMAIL, role: 'owner'},
          {email: NEW_EDITOR_EMAIL, role: 'editor'},
        ],
      },
      currentUserEmail: CURRENT_USER_EMAIL,
      prevVersion: 1,
    });

    const {config} = await fixture.trpc.getConfig({
      name: 'patch_members_success',
      projectId: fixture.projectId,
    });

    expect(config).toEqual({
      config: {
        name: 'patch_members_success',
        value: 'v1',
        schema: {type: 'string'},
        description: 'Members success test',
        createdAt: fixture.now,
        updatedAt: fixture.now,
        creatorId: TEST_USER_ID,
        id: expect.any(String),
        version: 2,
        projectId: fixture.projectId,
      },
      editorEmails: [NEW_EDITOR_EMAIL],
      ownerEmails: [CURRENT_USER_EMAIL],
      myRole: 'owner',
    } satisfies GetConfigResponse['config']);
  });

  it('should allow removing schema (set to null) without validation', async () => {
    const {configId} = await fixture.engine.useCases.createConfig(GLOBAL_CONTEXT, {
      name: 'patch_remove_schema',
      value: {flag: true},
      schema: {type: 'object', properties: {flag: {type: 'boolean'}}},
      description: 'Remove schema test',
      currentUserEmail: CURRENT_USER_EMAIL,
      editorEmails: [],
      ownerEmails: [CURRENT_USER_EMAIL], // need manage permission to change schema
      projectId: fixture.projectId,
    });

    await fixture.engine.useCases.patchConfig(GLOBAL_CONTEXT, {
      configId,
      schema: {newSchema: null},
      currentUserEmail: CURRENT_USER_EMAIL,
      prevVersion: 1,
    });

    const {config} = await fixture.trpc.getConfig({
      name: 'patch_remove_schema',
      projectId: fixture.projectId,
    });
    expect(config?.config.schema).toBeNull();
    expect(config?.config.version).toBe(2);
  });

  it('creates audit messages (config_created & config_updated)', async () => {
    const {configId} = await fixture.engine.useCases.createConfig(GLOBAL_CONTEXT, {
      name: 'patch_audit',
      value: {a: 1},
      schema: {type: 'object', properties: {a: {type: 'number'}}},
      description: 'audit',
      currentUserEmail: CURRENT_USER_EMAIL,
      editorEmails: [CURRENT_USER_EMAIL],
      ownerEmails: [],
      projectId: fixture.projectId,
    });

    await fixture.engine.useCases.patchConfig(GLOBAL_CONTEXT, {
      configId,
      value: {newValue: {a: 2}},
      currentUserEmail: CURRENT_USER_EMAIL,
      prevVersion: 1,
    });

    const messages = await fixture.engine.testing.auditMessages.list({
      lte: new Date('2100-01-01T00:00:00Z'),
      limit: 20,
      orderBy: 'created_at desc, id desc',
      projectId: fixture.projectId,
    });
    const types = messages.map(m => m.payload.type).sort();
    expect(types).toEqual(['config_created', 'config_updated', 'project_created']);
    const updated = messages.find(m => m.payload.type === 'config_updated')
      ?.payload as ConfigUpdatedAuditMessagePayload;
    expect(updated.before.value).toEqual({a: 1});
    expect(updated.after.value).toEqual({a: 2});
    expect(updated.before.name).toBe('patch_audit');
    expect(updated.after.name).toBe('patch_audit');
    expect(updated.after.version).toBe(updated.before.version + 1);
  });

  it('creates audit message (config_members_changed) on membership edit', async () => {
    const {configId} = await fixture.engine.useCases.createConfig(GLOBAL_CONTEXT, {
      name: 'patch_members_audit',
      value: 'v1',
      schema: {type: 'string'},
      description: 'members audit',
      currentUserEmail: CURRENT_USER_EMAIL,
      editorEmails: ['editor1@example.com'],
      ownerEmails: [CURRENT_USER_EMAIL],
      projectId: fixture.projectId,
    });

    await fixture.engine.useCases.patchConfig(GLOBAL_CONTEXT, {
      configId,
      members: {
        newMembers: [
          {email: CURRENT_USER_EMAIL, role: 'owner'},
          {email: 'editor2@example.com', role: 'editor'},
        ],
      },
      currentUserEmail: CURRENT_USER_EMAIL,
      prevVersion: 1,
    });

    const messages = await fixture.engine.testing.auditMessages.list({
      lte: new Date('2100-01-01T00:00:00Z'),
      limit: 20,
      orderBy: 'created_at desc, id desc',
      projectId: fixture.projectId,
    });
    const types = messages.map(m => m.payload.type).sort();
    expect(types).toEqual([
      'config_created',
      'config_members_changed',
      'config_updated',
      'project_created',
    ]);
    const membersChanged = messages.find(m => m.payload.type === 'config_members_changed')
      ?.payload as ConfigMembersChangedAuditMessagePayload;
    expect(membersChanged.config.name).toBe('patch_members_audit');
    // Removed editor1, added editor2
    expect(membersChanged.added).toEqual([{email: 'editor2@example.com', role: 'editor'}]);
    expect(membersChanged.removed).toEqual([{email: 'editor1@example.com', role: 'editor'}]);
  });
});
