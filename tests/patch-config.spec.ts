import type {
  ConfigMembersChangedAuditMessagePayload,
  ConfigProposalRejectedAuditMessagePayload,
  ConfigUpdatedAuditMessagePayload,
} from '@/engine/core/audit-message-store';
import {GLOBAL_CONTEXT} from '@/engine/core/context';
import {BadRequestError, ForbiddenError} from '@/engine/core/errors';
import type {GetConfigResponse} from '@/engine/core/use-cases/get-config-use-case';
import {normalizeEmail} from '@/engine/core/utils';
import {assert, describe, expect, it} from 'vitest';
import {TEST_USER_ID, useAppFixture} from './fixtures/trpc-fixture';

const CURRENT_USER_EMAIL = normalizeEmail('test@example.com');

// Additional emails for membership tests
const OTHER_EDITOR_EMAIL = normalizeEmail('other-editor@example.com');
const NEW_EDITOR_EMAIL = normalizeEmail('new-editor@example.com');

describe('patchConfig', () => {
  const fixture = useAppFixture({authEmail: CURRENT_USER_EMAIL});

  it('should patch overrides', async () => {
    const {configId} = await fixture.engine.useCases.createConfig(GLOBAL_CONTEXT, {
      name: 'patch_overrides',
      value: {maxItems: 10},
      schema: null,
      overrides: null,
      description: 'Test config',
      currentUserEmail: CURRENT_USER_EMAIL,
      editorEmails: [],
      maintainerEmails: [CURRENT_USER_EMAIL],
      projectId: fixture.projectId,
    });

    const newOverrides = [
      {
        id: '550e8400-e29b-41d4-a716-446655440001',
        name: 'Premium Users',
        rules: [
          {
            operator: 'equals',
            property: 'tier',
            value: 'premium',
          },
        ],
        value: {maxItems: 100},
      },
    ];

    await fixture.engine.useCases.patchConfig(GLOBAL_CONTEXT, {
      configId,
      overrides: {newOverrides},
      currentUserEmail: CURRENT_USER_EMAIL,
      prevVersion: 1,
    });

    const {config} = await fixture.trpc.getConfig({
      name: 'patch_overrides',
      projectId: fixture.projectId,
    });

    expect(config?.config.overrides).toEqual(newOverrides);
    expect(config?.config.version).toBe(2);
  });

  it('should patch value and description (editor permission)', async () => {
    const {configId} = await fixture.engine.useCases.createConfig(GLOBAL_CONTEXT, {
      name: 'patch_basic',
      value: {flag: true},
      schema: {type: 'object', properties: {flag: {type: 'boolean'}}},
      description: 'Initial description',
      currentUserEmail: CURRENT_USER_EMAIL,
      editorEmails: [CURRENT_USER_EMAIL],
      maintainerEmails: [],
      projectId: fixture.projectId,
      overrides: [],
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
      members: {users: [{email: 'some-other-user@example.com', role: 'admin'}]},
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
        overrides: [],
      },
      editorEmails: [CURRENT_USER_EMAIL],
      maintainerEmails: [],
      myRole: 'editor',
      pendingProposals: [],
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
      maintainerEmails: [CURRENT_USER_EMAIL], // need manage permission to change schema
      projectId: fixture.projectId,
      overrides: [],
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
      maintainerEmails: [CURRENT_USER_EMAIL], // need manage permission to change schema
      projectId: fixture.projectId,
      overrides: [],
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
      maintainerEmails: [],
      projectId: fixture.projectId,
      overrides: [],
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
      maintainerEmails: [],
      projectId: fixture.projectId,
      overrides: [],
    });

    await fixture.engine.useCases.patchProject(GLOBAL_CONTEXT, {
      currentUserEmail: CURRENT_USER_EMAIL,
      id: fixture.projectId,
      members: {users: [{email: 'some-other-user@example.com', role: 'admin'}]},
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
      maintainerEmails: [CURRENT_USER_EMAIL],
      projectId: fixture.projectId,
      overrides: [],
    });

    // Remove OTHER_EDITOR_EMAIL, add NEW_EDITOR_EMAIL
    await fixture.engine.useCases.patchConfig(GLOBAL_CONTEXT, {
      configId,
      members: {
        newMembers: [
          {email: CURRENT_USER_EMAIL, role: 'maintainer'},
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
        overrides: [],
      },
      editorEmails: [NEW_EDITOR_EMAIL],
      maintainerEmails: [CURRENT_USER_EMAIL],
      myRole: 'maintainer',
      pendingProposals: [],
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
      maintainerEmails: [CURRENT_USER_EMAIL], // need manage permission to change schema
      projectId: fixture.projectId,
      overrides: [],
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
      maintainerEmails: [],
      projectId: fixture.projectId,
      overrides: [],
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
      maintainerEmails: [CURRENT_USER_EMAIL],
      projectId: fixture.projectId,
      overrides: [],
    });

    await fixture.engine.useCases.patchConfig(GLOBAL_CONTEXT, {
      configId,
      members: {
        newMembers: [
          {email: CURRENT_USER_EMAIL, role: 'maintainer'},
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

  it('should reject all pending proposals', async () => {
    // Create a config
    const {configId} = await fixture.engine.useCases.createConfig(GLOBAL_CONTEXT, {
      name: 'proposal_test_config',
      value: {count: 1},
      schema: {type: 'object', properties: {count: {type: 'number'}}},
      description: 'Original description',
      currentUserEmail: CURRENT_USER_EMAIL,
      editorEmails: [CURRENT_USER_EMAIL],
      maintainerEmails: [],
      projectId: fixture.projectId,
      overrides: [],
    });

    // Create three proposals
    const {configProposalId: proposal1Id} = await fixture.engine.useCases.createConfigProposal(
      GLOBAL_CONTEXT,
      {
        baseVersion: 1,
        configId,
        proposedValue: {newValue: {count: 2}},
        currentUserEmail: CURRENT_USER_EMAIL,
      },
    );

    const {configProposalId: proposal2Id} = await fixture.engine.useCases.createConfigProposal(
      GLOBAL_CONTEXT,
      {
        baseVersion: 1,
        configId,
        proposedValue: {newValue: {count: 3}},
        currentUserEmail: CURRENT_USER_EMAIL,
      },
    );

    const {configProposalId: proposal3Id} = await fixture.engine.useCases.createConfigProposal(
      GLOBAL_CONTEXT,
      {
        baseVersion: 1,
        configId,
        proposedValue: {newValue: {count: 4}},
        currentUserEmail: CURRENT_USER_EMAIL,
      },
    );

    // Verify all proposals are pending
    const pendingBefore = await fixture.engine.testing.configProposals.getPendingProposals({
      configId,
    });
    expect(pendingBefore).toHaveLength(3);

    // Approve proposal 2 by patching the config with its proposalId
    await fixture.engine.useCases.patchConfig(GLOBAL_CONTEXT, {
      configId,
      value: {newValue: {count: 3}},
      currentUserEmail: CURRENT_USER_EMAIL,
      prevVersion: 1,
    });

    // Verify proposals 1, 2, and 3 are rejected
    const rejectedProposal1 = await fixture.engine.testing.configProposals.getById(proposal1Id);
    assert(rejectedProposal1, 'Proposal 1 should exist');
    expect(rejectedProposal1.approvedAt).toBeNull();
    expect(rejectedProposal1.rejectedAt).not.toBeNull();
    expect(rejectedProposal1.reviewerId).toBe(TEST_USER_ID);
    expect(rejectedProposal1.rejectedInFavorOfProposalId).toBe(null);
    expect(rejectedProposal1.rejectionReason).toBe('config_edited');

    const rejectedProposal2 = await fixture.engine.testing.configProposals.getById(proposal2Id);
    assert(rejectedProposal2, 'Proposal 2 should exist');
    expect(rejectedProposal2.approvedAt).toBeNull();
    expect(rejectedProposal2.rejectedAt).not.toBeNull();
    expect(rejectedProposal2.reviewerId).toBe(TEST_USER_ID);
    expect(rejectedProposal2.rejectedInFavorOfProposalId).toBe(null);
    expect(rejectedProposal2.rejectionReason).toBe('config_edited');

    const rejectedProposal3 = await fixture.engine.testing.configProposals.getById(proposal3Id);
    assert(rejectedProposal3, 'Proposal 3 should exist');
    expect(rejectedProposal3.approvedAt).toBeNull();
    expect(rejectedProposal3.rejectedAt).not.toBeNull();
    expect(rejectedProposal3.reviewerId).toBe(TEST_USER_ID);
    expect(rejectedProposal3.rejectedInFavorOfProposalId).toBe(null);
    expect(rejectedProposal3.rejectionReason).toBe('config_edited');

    // Verify no pending proposals remain
    const pendingAfter = await fixture.engine.testing.configProposals.getPendingProposals({
      configId,
    });
    expect(pendingAfter).toHaveLength(0);
  });
  it('should reject all pending proposals when patching normally', async () => {
    const {configId} = await fixture.engine.useCases.createConfig(GLOBAL_CONTEXT, {
      name: 'normal_patch_config',
      value: {x: 1},
      schema: null,
      description: 'Test',
      currentUserEmail: CURRENT_USER_EMAIL,
      editorEmails: [CURRENT_USER_EMAIL],
      maintainerEmails: [],
      projectId: fixture.projectId,
      overrides: [],
    });

    // Create a proposal
    const {configProposalId} = await fixture.engine.useCases.createConfigProposal(GLOBAL_CONTEXT, {
      baseVersion: 1,
      configId,
      proposedValue: {newValue: {x: 2}},
      currentUserEmail: CURRENT_USER_EMAIL,
    });

    // Patch without proposalId - should reject the pending proposal
    await fixture.engine.useCases.patchConfig(GLOBAL_CONTEXT, {
      configId,
      value: {newValue: {x: 5}},
      currentUserEmail: CURRENT_USER_EMAIL,
      prevVersion: 1,
    });

    const {config} = await fixture.trpc.getConfig({
      name: 'normal_patch_config',
      projectId: fixture.projectId,
    });

    expect(config?.config.value).toEqual({x: 5});
    expect(config?.config.version).toBe(2);

    // Verify the proposal is now rejected
    const rejectedProposal = await fixture.engine.testing.configProposals.getById(configProposalId);
    assert(rejectedProposal, 'Proposal should exist');
    expect(rejectedProposal.approvedAt).toBeNull();
    expect(rejectedProposal.rejectedAt).not.toBeNull();
    expect(rejectedProposal.reviewerId).toBe(TEST_USER_ID);

    // Verify no pending proposals remain
    const pendingProposals = await fixture.engine.testing.configProposals.getPendingProposals({
      configId,
    });
    expect(pendingProposals).toHaveLength(0);
  });

  it('should create audit messages for rejected proposals', async () => {
    const {configId} = await fixture.engine.useCases.createConfig(GLOBAL_CONTEXT, {
      name: 'audit_proposal_rejection',
      value: {x: 1},
      schema: null,
      description: 'Test',
      currentUserEmail: CURRENT_USER_EMAIL,
      editorEmails: [CURRENT_USER_EMAIL],
      maintainerEmails: [],
      projectId: fixture.projectId,
      overrides: [],
    });

    // Create three proposals
    const {configProposalId: proposal1Id} = await fixture.engine.useCases.createConfigProposal(
      GLOBAL_CONTEXT,
      {
        baseVersion: 1,
        configId,
        proposedValue: {newValue: {x: 2}},
        currentUserEmail: CURRENT_USER_EMAIL,
      },
    );

    const {configProposalId: proposal2Id} = await fixture.engine.useCases.createConfigProposal(
      GLOBAL_CONTEXT,
      {
        baseVersion: 1,
        configId,
        proposedValue: {newValue: {x: 3}},
        proposedDescription: {newDescription: 'Updated'},
        currentUserEmail: CURRENT_USER_EMAIL,
      },
    );

    const {configProposalId: proposal3Id} = await fixture.engine.useCases.createConfigProposal(
      GLOBAL_CONTEXT,
      {
        baseVersion: 1,
        configId,
        proposedSchema: {newSchema: {type: 'object', properties: {y: {type: 'number'}}}},
        currentUserEmail: CURRENT_USER_EMAIL,
      },
    );

    // Get audit messages before patch
    const auditMessagesBefore = await fixture.engine.testing.auditMessages.list({
      lte: fixture.now,
      limit: 100,
      orderBy: 'created_at desc, id desc',
      projectId: fixture.projectId,
    });
    const beforeCount = auditMessagesBefore.length;

    // Patch config without proposalId - should reject all proposals
    await fixture.engine.useCases.patchConfig(GLOBAL_CONTEXT, {
      configId,
      value: {newValue: {x: 10}},
      currentUserEmail: CURRENT_USER_EMAIL,
      prevVersion: 1,
    });

    // Get audit messages after patch
    const auditMessagesAfter = await fixture.engine.testing.auditMessages.list({
      lte: fixture.now,
      limit: 100,
      orderBy: 'created_at desc, id desc',
      projectId: fixture.projectId,
    });

    // Should have 3 rejection audit messages + 1 config_updated message
    expect(auditMessagesAfter.length).toBe(beforeCount + 4);

    // Find rejection audit messages
    const rejectionMessages = auditMessagesAfter.filter(
      msg => msg.payload.type === 'config_proposal_rejected',
    ) as Array<{
      payload: ConfigProposalRejectedAuditMessagePayload;
      userId: number | null;
      configId: string | null;
    }>;

    expect(rejectionMessages).toHaveLength(3);

    // Verify proposal 1 rejection message
    const rejection1 = rejectionMessages.find(msg => msg.payload.proposalId === proposal1Id);
    expect(rejection1).toBeDefined();
    expect(rejection1?.payload.configId).toBe(configId);
    expect(rejection1?.payload.rejectedInFavorOfProposalId).toBeUndefined();
    expect(rejection1?.payload.proposedValue).toEqual({newValue: {x: 2}});
    expect(rejection1?.payload.proposedDescription).toBeUndefined();
    expect(rejection1?.payload.proposedSchema).toBeUndefined();
    expect(rejection1?.userId).toBe(TEST_USER_ID);
    expect(rejection1?.configId).toBe(configId);

    // Verify proposal 2 rejection message
    const rejection2 = rejectionMessages.find(msg => msg.payload.proposalId === proposal2Id);
    expect(rejection2).toBeDefined();
    expect(rejection2?.payload.configId).toBe(configId);
    expect(rejection2?.payload.rejectedInFavorOfProposalId).toBeUndefined();
    expect(rejection2?.payload.proposedValue).toEqual({newValue: {x: 3}});
    expect(rejection2?.payload.proposedDescription).toBe('Updated');
    expect(rejection2?.payload.proposedSchema).toBeUndefined();
    expect(rejection2?.userId).toBe(TEST_USER_ID);

    // Verify proposal 3 rejection message
    const rejection3 = rejectionMessages.find(msg => msg.payload.proposalId === proposal3Id);
    expect(rejection3).toBeDefined();
    expect(rejection3?.payload.configId).toBe(configId);
    expect(rejection3?.payload.rejectedInFavorOfProposalId).toBeUndefined();
    expect(rejection3?.payload.proposedValue).toBeUndefined();
    expect(rejection3?.payload.proposedDescription).toBeUndefined();
    expect(rejection3?.payload.proposedSchema).toEqual({
      newSchema: {type: 'object', properties: {y: {type: 'number'}}},
    });
    expect(rejection3?.userId).toBe(TEST_USER_ID);
  });

  it('should throw BadRequestError when patching with user in multiple roles', async () => {
    const {configId} = await fixture.engine.useCases.createConfig(GLOBAL_CONTEXT, {
      name: 'patch_duplicate_user',
      value: {x: 1},
      schema: null,
      description: 'Test',
      currentUserEmail: CURRENT_USER_EMAIL,
      editorEmails: [CURRENT_USER_EMAIL],
      maintainerEmails: [],
      projectId: fixture.projectId,
      overrides: [],
    });

    const duplicateEmail = 'duplicate@example.com';

    // Try to patch with user in both editor and owner roles
    await expect(
      fixture.engine.useCases.patchConfig(GLOBAL_CONTEXT, {
        configId,
        members: {
          newMembers: [
            {email: duplicateEmail, role: 'editor'},
            {email: duplicateEmail, role: 'maintainer'},
            {email: 'other@example.com', role: 'editor'},
          ],
        },
        currentUserEmail: CURRENT_USER_EMAIL,
        prevVersion: 1,
      }),
    ).rejects.toThrow(BadRequestError);

    // Verify config was not updated
    const {config} = await fixture.trpc.getConfig({
      name: 'patch_duplicate_user',
      projectId: fixture.projectId,
    });
    expect(config?.config.version).toBe(1);
  });

  it('should throw BadRequestError for duplicate users in members (case insensitive)', async () => {
    const {configId} = await fixture.engine.useCases.createConfig(GLOBAL_CONTEXT, {
      name: 'patch_case_insensitive_duplicate',
      value: {x: 1},
      schema: null,
      description: 'Test',
      currentUserEmail: CURRENT_USER_EMAIL,
      editorEmails: [CURRENT_USER_EMAIL],
      maintainerEmails: [],
      projectId: fixture.projectId,
      overrides: [],
    });

    // Try to patch with user in both roles (different case)
    await expect(
      fixture.engine.useCases.patchConfig(GLOBAL_CONTEXT, {
        configId,
        members: {
          newMembers: [
            {email: 'User@Example.com', role: 'editor'},
            {email: 'user@example.com', role: 'maintainer'},
          ],
        },
        currentUserEmail: CURRENT_USER_EMAIL,
        prevVersion: 1,
      }),
    ).rejects.toThrow(BadRequestError);

    // Verify config was not updated
    const {config} = await fixture.trpc.getConfig({
      name: 'patch_case_insensitive_duplicate',
      projectId: fixture.projectId,
    });
    expect(config?.config.version).toBe(1);
  });

  it('should successfully patch with unique members', async () => {
    const {configId} = await fixture.engine.useCases.createConfig(GLOBAL_CONTEXT, {
      name: 'patch_unique_members',
      value: {x: 1},
      schema: null,
      description: 'Test',
      currentUserEmail: CURRENT_USER_EMAIL,
      editorEmails: [CURRENT_USER_EMAIL],
      maintainerEmails: [],
      projectId: fixture.projectId,
      overrides: [],
    });

    // Patch with unique members
    await fixture.engine.useCases.patchConfig(GLOBAL_CONTEXT, {
      configId,
      members: {
        newMembers: [
          {email: 'editor1@example.com', role: 'editor'},
          {email: 'editor2@example.com', role: 'editor'},
          {email: 'owner1@example.com', role: 'maintainer'},
          {email: CURRENT_USER_EMAIL, role: 'maintainer'},
        ],
      },
      currentUserEmail: CURRENT_USER_EMAIL,
      prevVersion: 1,
    });

    // Verify config was updated
    const {config} = await fixture.trpc.getConfig({
      name: 'patch_unique_members',
      projectId: fixture.projectId,
    });
    expect(config?.config.version).toBe(2);
    expect(config?.editorEmails).toContain(normalizeEmail('editor1@example.com'));
    expect(config?.editorEmails).toContain(normalizeEmail('editor2@example.com'));
    expect(config?.maintainerEmails).toContain(normalizeEmail('owner1@example.com'));
    expect(config?.maintainerEmails).toContain(CURRENT_USER_EMAIL);
  });

  it('should version members when patching', async () => {
    const editor1 = normalizeEmail('editor1@example.com');
    const editor2 = normalizeEmail('editor2@example.com');

    const {configId} = await fixture.engine.useCases.createConfig(GLOBAL_CONTEXT, {
      name: 'patch_version_members',
      value: {x: 1},
      schema: null,
      description: 'Test',
      currentUserEmail: CURRENT_USER_EMAIL,
      editorEmails: [editor1],
      maintainerEmails: [CURRENT_USER_EMAIL],
      projectId: fixture.projectId,
      overrides: [],
    });

    // Verify version 1 has initial members
    const version1Id = await fixture.engine.testing.pool.query(
      `SELECT id FROM config_versions WHERE config_id = $1 AND version = 1`,
      [configId],
    );
    const v1Id = version1Id.rows[0].id;

    const v1Members = await fixture.engine.testing.pool.query(
      `SELECT user_email_normalized, role FROM config_version_members WHERE config_version_id = $1`,
      [v1Id],
    );
    const v1Owners = v1Members.rows
      .filter(m => m.role === 'maintainer')
      .map(m => m.user_email_normalized);
    const v1Editors = v1Members.rows
      .filter(m => m.role === 'editor')
      .map(m => m.user_email_normalized);

    expect(v1Owners).toEqual([CURRENT_USER_EMAIL]);
    expect(v1Editors).toEqual([editor1]);

    // Patch to change both value and members
    await fixture.engine.useCases.patchConfig(GLOBAL_CONTEXT, {
      configId,
      value: {newValue: {x: 2}},
      members: {
        newMembers: [
          {email: CURRENT_USER_EMAIL, role: 'maintainer'},
          {email: editor2, role: 'editor'},
        ],
      },
      currentUserEmail: CURRENT_USER_EMAIL,
      prevVersion: 1,
    });

    // Verify version 2 has updated members
    const version2Id = await fixture.engine.testing.pool.query(
      `SELECT id FROM config_versions WHERE config_id = $1 AND version = 2`,
      [configId],
    );
    const v2Id = version2Id.rows[0].id;

    const v2Members = await fixture.engine.testing.pool.query(
      `SELECT user_email_normalized, role FROM config_version_members WHERE config_version_id = $1`,
      [v2Id],
    );
    const v2Owners = v2Members.rows
      .filter(m => m.role === 'maintainer')
      .map(m => m.user_email_normalized);
    const v2Editors = v2Members.rows
      .filter(m => m.role === 'editor')
      .map(m => m.user_email_normalized);

    expect(v2Owners).toEqual([CURRENT_USER_EMAIL]);
    expect(v2Editors).toEqual([editor2]);
  });

  it('should version members even when only value changes', async () => {
    const editor = normalizeEmail('editor@example.com');

    const {configId} = await fixture.engine.useCases.createConfig(GLOBAL_CONTEXT, {
      name: 'patch_value_only_members',
      value: {x: 1},
      schema: null,
      description: 'Test',
      currentUserEmail: CURRENT_USER_EMAIL,
      editorEmails: [editor],
      maintainerEmails: [CURRENT_USER_EMAIL],
      projectId: fixture.projectId,
      overrides: [],
    });

    // Patch only the value (not members)
    await fixture.engine.useCases.patchConfig(GLOBAL_CONTEXT, {
      configId,
      value: {newValue: {x: 2}},
      currentUserEmail: CURRENT_USER_EMAIL,
      prevVersion: 1,
    });

    // Verify version 2 still has members snapshot
    const version2Id = await fixture.engine.testing.pool.query(
      `SELECT id FROM config_versions WHERE config_id = $1 AND version = 2`,
      [configId],
    );
    const v2Id = version2Id.rows[0].id;

    const v2Members = await fixture.engine.testing.pool.query(
      `SELECT user_email_normalized, role FROM config_version_members WHERE config_version_id = $1`,
      [v2Id],
    );

    expect(v2Members.rows.length).toBeGreaterThan(0);
    const v2Owners = v2Members.rows
      .filter(m => m.role === 'maintainer')
      .map(m => m.user_email_normalized);
    const v2Editors = v2Members.rows
      .filter(m => m.role === 'editor')
      .map(m => m.user_email_normalized);

    expect(v2Owners).toEqual([CURRENT_USER_EMAIL]);
    expect(v2Editors).toEqual([editor]);
  });
});
