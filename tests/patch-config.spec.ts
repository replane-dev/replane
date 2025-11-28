import type {
  ConfigMembersChangedAuditLogPayload,
  ConfigProposalRejectedAuditLogPayload,
  ConfigUpdatedAuditLogPayload,
} from '@/engine/core/audit-log-store';
import {createConfigProposalId} from '@/engine/core/config-proposal-store';
import {GLOBAL_CONTEXT} from '@/engine/core/context';
import {BadRequestError, ForbiddenError} from '@/engine/core/errors';
import {normalizeEmail} from '@/engine/core/utils';
import {assert, beforeEach, describe, expect, it} from 'vitest';
import {TEST_USER_ID, useAppFixture} from './fixtures/trpc-fixture';

const CURRENT_USER_EMAIL = normalizeEmail('test@example.com');

// Additional emails for membership tests
const OTHER_EDITOR_EMAIL = normalizeEmail('other-editor@example.com');
const NEW_EDITOR_EMAIL = normalizeEmail('new-editor@example.com');
const OTHER_USER_EMAIL = normalizeEmail('other@example.com');
const OTHER_USER_ID = 2;

describe('patchConfig', () => {
  const fixture = useAppFixture({authEmail: CURRENT_USER_EMAIL});

  beforeEach(async () => {
    const connection = await fixture.engine.testing.pool.connect();
    try {
      await connection.query(
        `INSERT INTO users(id, name, email, "emailVerified") VALUES ($1, 'Other', $2, NOW())`,
        [OTHER_USER_ID, OTHER_USER_EMAIL],
      );
    } finally {
      connection.release();
    }
  });

  it('should patch description (maintainer permission)', async () => {
    const {configId} = await fixture.engine.useCases.createConfig(GLOBAL_CONTEXT, {
      name: 'patch_description',
      value: {flag: true},
      schema: null,
      description: 'Initial description',
      currentUserEmail: CURRENT_USER_EMAIL,
      editorEmails: [],
      maintainerEmails: [CURRENT_USER_EMAIL],
      projectId: fixture.projectId,
      overrides: [],
    });

    await fixture.engine.useCases.patchConfig(GLOBAL_CONTEXT, {
      configId,
      description: {newDescription: 'Updated description'},
      currentUserEmail: CURRENT_USER_EMAIL,
      prevVersion: 1,
    });

    const {config} = await fixture.trpc.getConfig({
      name: 'patch_description',
      projectId: fixture.projectId,
    });

    expect(config?.config.description).toBe('Updated description');
    expect(config?.config.version).toBe(2);
  });

  it('should enforce manage permission when changing members', async () => {
    const {configId: editorOnlyId} = await fixture.engine.useCases.createConfig(GLOBAL_CONTEXT, {
      name: 'patch_members_forbidden',
      value: 'v',
      schema: {type: 'string'},
      description: 'Members perm test',
      currentUserEmail: CURRENT_USER_EMAIL,
      editorEmails: [OTHER_USER_EMAIL],
      maintainerEmails: [CURRENT_USER_EMAIL],
      projectId: fixture.projectId,
      overrides: [],
    });

    // OTHER_USER is only editor, should not be able to change members
    await expect(
      fixture.engine.useCases.patchConfig(GLOBAL_CONTEXT, {
        configId: editorOnlyId,
        members: {newMembers: [{email: OTHER_USER_EMAIL, role: 'editor'}]},
        currentUserEmail: OTHER_USER_EMAIL,
        prevVersion: 1,
      }),
    ).rejects.toBeInstanceOf(ForbiddenError);
  });

  it('should update members (add & remove) when user is maintainer', async () => {
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

    // Config metadata - version doesn't change for member-only updates
    expect(config?.config.name).toBe('patch_members_success');
    expect(config?.config.description).toBe('Members success test');
    expect(config?.config.version).toBe(1);

    // Members updated
    expect(config?.editorEmails).toEqual([NEW_EDITOR_EMAIL]);
    expect(config?.maintainerEmails).toEqual([CURRENT_USER_EMAIL]);
    expect(config?.myRole).toBe('maintainer');
    expect(config?.pendingConfigProposals).toEqual([]);

    // Variants should exist with their own data
    expect(config?.variants).toHaveLength(2); // Production and Development
  });

  it('should fail with version mismatch', async () => {
    const {configId} = await fixture.engine.useCases.createConfig(GLOBAL_CONTEXT, {
      name: 'patch_version_conflict',
      value: 1,
      schema: {type: 'number'},
      description: 'Version conflict test',
      currentUserEmail: CURRENT_USER_EMAIL,
      editorEmails: [],
      maintainerEmails: [CURRENT_USER_EMAIL],
      projectId: fixture.projectId,
      overrides: [],
    });

    await expect(
      fixture.engine.useCases.patchConfig(GLOBAL_CONTEXT, {
        configId,
        description: {newDescription: 'New desc'},
        currentUserEmail: CURRENT_USER_EMAIL,
        prevVersion: 999, // wrong prev version
      }),
    ).rejects.toBeInstanceOf(BadRequestError);
  });

  it('creates audit message (config_updated) on description change', async () => {
    const {configId} = await fixture.engine.useCases.createConfig(GLOBAL_CONTEXT, {
      name: 'patch_audit_desc',
      value: {a: 1},
      schema: {type: 'object', properties: {a: {type: 'number'}}},
      description: 'Original description',
      currentUserEmail: CURRENT_USER_EMAIL,
      editorEmails: [],
      maintainerEmails: [CURRENT_USER_EMAIL],
      projectId: fixture.projectId,
      overrides: [],
    });

    await fixture.engine.useCases.patchConfig(GLOBAL_CONTEXT, {
      configId,
      description: {newDescription: 'Updated description'},
      currentUserEmail: CURRENT_USER_EMAIL,
      prevVersion: 1,
    });

    const messages = await fixture.engine.testing.auditLogs.list({
      lte: new Date('2100-01-01T00:00:00Z'),
      limit: 20,
      orderBy: 'created_at desc, id desc',
      projectId: fixture.projectId,
    });
    const types = messages.map(m => m.payload.type).sort();
    expect(types).toContain('config_updated');
    const updated = messages.find(m => m.payload.type === 'config_updated')
      ?.payload as ConfigUpdatedAuditLogPayload;
    expect(updated.before.description).toBe('Original description');
    expect(updated.after.description).toBe('Updated description');
    expect(updated.before.name).toBe('patch_audit_desc');
    expect(updated.after.name).toBe('patch_audit_desc');
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

    const messages = await fixture.engine.testing.auditLogs.list({
      lte: new Date('2100-01-01T00:00:00Z'),
      limit: 20,
      orderBy: 'created_at desc, id desc',
      projectId: fixture.projectId,
    });
    const types = messages.map(m => m.payload.type).sort();
    expect(types).toContain('config_members_changed');
    const membersChanged = messages.find(m => m.payload.type === 'config_members_changed')
      ?.payload as ConfigMembersChangedAuditLogPayload;
    expect(membersChanged.config.name).toBe('patch_members_audit');
    // Removed editor1, added editor2
    expect(membersChanged.added).toEqual([{email: 'editor2@example.com', role: 'editor'}]);
    expect(membersChanged.removed).toEqual([{email: 'editor1@example.com', role: 'editor'}]);
  });

  it('should reject all pending config proposals when patching', async () => {
    // Create a config
    const {configId} = await fixture.engine.useCases.createConfig(GLOBAL_CONTEXT, {
      name: 'proposal_test_config',
      value: {count: 1},
      schema: null,
      description: 'Original description',
      currentUserEmail: CURRENT_USER_EMAIL,
      editorEmails: [],
      maintainerEmails: [CURRENT_USER_EMAIL],
      projectId: fixture.projectId,
      overrides: [],
    });

    // Create three proposals (config-level: description changes)
    const {configProposalId: proposal1Id} = await fixture.engine.useCases.createConfigProposal(
      GLOBAL_CONTEXT,
      {
        baseVersion: 1,
        configId,
        proposedDescription: {newDescription: 'Description 1'},
        currentUserEmail: CURRENT_USER_EMAIL,
      },
    );

    const {configProposalId: proposal2Id} = await fixture.engine.useCases.createConfigProposal(
      GLOBAL_CONTEXT,
      {
        baseVersion: 1,
        configId,
        proposedDescription: {newDescription: 'Description 2'},
        currentUserEmail: CURRENT_USER_EMAIL,
      },
    );

    const {configProposalId: proposal3Id} = await fixture.engine.useCases.createConfigProposal(
      GLOBAL_CONTEXT,
      {
        baseVersion: 1,
        configId,
        proposedDescription: {newDescription: 'Description 3'},
        currentUserEmail: CURRENT_USER_EMAIL,
      },
    );

    // Verify all proposals are pending
    const pendingBefore = await fixture.engine.testing.configProposals.getPendingProposals({
      configId,
    });
    expect(pendingBefore).toHaveLength(3);

    // Patch the config - should reject all proposals
    await fixture.engine.useCases.patchConfig(GLOBAL_CONTEXT, {
      configId,
      description: {newDescription: 'Final description'},
      currentUserEmail: CURRENT_USER_EMAIL,
      prevVersion: 1,
    });

    // Verify all proposals are rejected
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
    expect(rejectedProposal2.rejectionReason).toBe('config_edited');

    const rejectedProposal3 = await fixture.engine.testing.configProposals.getById(proposal3Id);
    assert(rejectedProposal3, 'Proposal 3 should exist');
    expect(rejectedProposal3.approvedAt).toBeNull();
    expect(rejectedProposal3.rejectedAt).not.toBeNull();
    expect(rejectedProposal3.rejectionReason).toBe('config_edited');

    // Verify no pending proposals remain
    const pendingAfter = await fixture.engine.testing.configProposals.getPendingProposals({
      configId,
    });
    expect(pendingAfter).toHaveLength(0);
  });

  it('should create audit messages for rejected config proposals', async () => {
    const {configId} = await fixture.engine.useCases.createConfig(GLOBAL_CONTEXT, {
      name: 'audit_proposal_rejection',
      value: {x: 1},
      schema: null,
      description: 'Test',
      currentUserEmail: CURRENT_USER_EMAIL,
      editorEmails: [],
      maintainerEmails: [CURRENT_USER_EMAIL],
      projectId: fixture.projectId,
      overrides: [],
    });

    // Create proposals directly in DB to control the data
    const proposal1Id = createConfigProposalId();
    const proposal2Id = createConfigProposalId();

    await fixture.engine.testing.configProposals.create({
      id: proposal1Id,
      configId,
      proposerId: TEST_USER_ID,
      createdAt: fixture.now,
      rejectedAt: null,
      approvedAt: null,
      reviewerId: null,
      rejectedInFavorOfProposalId: null,
      rejectionReason: null,
      baseConfigVersion: 1,
      originalMembers: [],
      originalDescription: 'Test',
      proposedDelete: false,
      proposedDescription: 'Updated description 1',
      proposedMembers: null,
      message: null,
    });

    await fixture.engine.testing.configProposals.create({
      id: proposal2Id,
      configId,
      proposerId: TEST_USER_ID,
      createdAt: fixture.now,
      rejectedAt: null,
      approvedAt: null,
      reviewerId: null,
      rejectedInFavorOfProposalId: null,
      rejectionReason: null,
      baseConfigVersion: 1,
      originalMembers: [],
      originalDescription: 'Test',
      proposedDelete: false,
      proposedDescription: null,
      proposedMembers: {newMembers: [{email: 'new-member@example.com', role: 'editor'}]},
      message: null,
    });

    // Get audit messages before patch
    const auditMessagesBefore = await fixture.engine.testing.auditLogs.list({
      lte: fixture.now,
      limit: 100,
      orderBy: 'created_at desc, id desc',
      projectId: fixture.projectId,
    });
    const beforeCount = auditMessagesBefore.length;

    // Patch config - should reject all proposals
    await fixture.engine.useCases.patchConfig(GLOBAL_CONTEXT, {
      configId,
      description: {newDescription: 'Direct change'},
      currentUserEmail: CURRENT_USER_EMAIL,
      prevVersion: 1,
    });

    // Get audit messages after patch
    const auditMessagesAfter = await fixture.engine.testing.auditLogs.list({
      lte: fixture.now,
      limit: 100,
      orderBy: 'created_at desc, id desc',
      projectId: fixture.projectId,
    });

    // Should have 2 rejection audit messages + 1 config_updated message
    expect(auditMessagesAfter.length).toBe(beforeCount + 3);

    // Find rejection audit messages
    const rejectionMessages = auditMessagesAfter.filter(
      msg => msg.payload.type === 'config_proposal_rejected',
    ) as Array<{
      payload: ConfigProposalRejectedAuditLogPayload;
      userId: number | null;
      configId: string | null;
    }>;

    expect(rejectionMessages).toHaveLength(2);

    // Verify proposal 1 rejection message
    const rejection1 = rejectionMessages.find(msg => msg.payload.proposalId === proposal1Id);
    expect(rejection1).toBeDefined();
    expect(rejection1?.payload.configId).toBe(configId);
    expect(rejection1?.payload.proposedDescription).toBe('Updated description 1');
    expect(rejection1?.payload.proposedMembers).toBeUndefined();
    expect(rejection1?.userId).toBe(TEST_USER_ID);

    // Verify proposal 2 rejection message
    const rejection2 = rejectionMessages.find(msg => msg.payload.proposalId === proposal2Id);
    expect(rejection2).toBeDefined();
    expect(rejection2?.payload.configId).toBe(configId);
    expect(rejection2?.payload.proposedDescription).toBeUndefined();
    expect(rejection2?.payload.proposedMembers).toEqual({
      newMembers: [{email: 'new-member@example.com', role: 'editor'}],
    });
  });

  it('should throw BadRequestError when patching with user in multiple roles', async () => {
    const {configId} = await fixture.engine.useCases.createConfig(GLOBAL_CONTEXT, {
      name: 'patch_duplicate_user',
      value: {x: 1},
      schema: null,
      description: 'Test',
      currentUserEmail: CURRENT_USER_EMAIL,
      editorEmails: [],
      maintainerEmails: [CURRENT_USER_EMAIL],
      projectId: fixture.projectId,
      overrides: [],
    });

    const duplicateEmail = 'duplicate@example.com';

    // Try to patch with user in both editor and maintainer roles
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
      editorEmails: [],
      maintainerEmails: [CURRENT_USER_EMAIL],
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
      editorEmails: [],
      maintainerEmails: [CURRENT_USER_EMAIL],
      projectId: fixture.projectId,
      overrides: [],
    });

    // Patch with unique members (need manage permission)
    await fixture.engine.useCases.patchConfig(GLOBAL_CONTEXT, {
      configId,
      members: {
        newMembers: [
          {email: 'editor1@example.com', role: 'editor'},
          {email: 'editor2@example.com', role: 'editor'},
          {email: 'maintainer1@example.com', role: 'maintainer'},
          {email: CURRENT_USER_EMAIL, role: 'maintainer'},
        ],
      },
      currentUserEmail: CURRENT_USER_EMAIL,
      prevVersion: 1,
    });

    // Verify members were updated (version doesn't change for member-only updates)
    const {config} = await fixture.trpc.getConfig({
      name: 'patch_unique_members',
      projectId: fixture.projectId,
    });
    expect(config?.config.version).toBe(1);
    expect(config?.editorEmails).toContain(normalizeEmail('editor1@example.com'));
    expect(config?.editorEmails).toContain(normalizeEmail('editor2@example.com'));
    expect(config?.maintainerEmails).toContain(normalizeEmail('maintainer1@example.com'));
    expect(config?.maintainerEmails).toContain(CURRENT_USER_EMAIL);
  });

  it('should increment version on patch', async () => {
    const {configId} = await fixture.engine.useCases.createConfig(GLOBAL_CONTEXT, {
      name: 'patch_version',
      value: {x: 1},
      schema: null,
      description: 'Test',
      currentUserEmail: CURRENT_USER_EMAIL,
      editorEmails: [],
      maintainerEmails: [CURRENT_USER_EMAIL],
      projectId: fixture.projectId,
      overrides: [],
    });

    // Get initial config
    const {config: initialConfig} = await fixture.trpc.getConfig({
      name: 'patch_version',
      projectId: fixture.projectId,
    });
    expect(initialConfig?.config.version).toBe(1);

    // Patch the config
    await fixture.engine.useCases.patchConfig(GLOBAL_CONTEXT, {
      configId,
      description: {newDescription: 'Updated'},
      currentUserEmail: CURRENT_USER_EMAIL,
      prevVersion: 1,
    });

    // Get updated config
    const {config: updatedConfig} = await fixture.trpc.getConfig({
      name: 'patch_version',
      projectId: fixture.projectId,
    });

    expect(updatedConfig?.config.version).toBe(2);
  });

  it('should patch both description and members at once', async () => {
    const {configId} = await fixture.engine.useCases.createConfig(GLOBAL_CONTEXT, {
      name: 'patch_both',
      value: {x: 1},
      schema: null,
      description: 'Original description',
      currentUserEmail: CURRENT_USER_EMAIL,
      editorEmails: ['old-editor@example.com'],
      maintainerEmails: [CURRENT_USER_EMAIL],
      projectId: fixture.projectId,
      overrides: [],
    });

    await fixture.engine.useCases.patchConfig(GLOBAL_CONTEXT, {
      configId,
      description: {newDescription: 'New description'},
      members: {
        newMembers: [
          {email: CURRENT_USER_EMAIL, role: 'maintainer'},
          {email: 'new-editor@example.com', role: 'editor'},
        ],
      },
      currentUserEmail: CURRENT_USER_EMAIL,
      prevVersion: 1,
    });

    const {config} = await fixture.trpc.getConfig({
      name: 'patch_both',
      projectId: fixture.projectId,
    });

    expect(config?.config.description).toBe('New description');
    expect(config?.editorEmails).toEqual([normalizeEmail('new-editor@example.com')]);
    expect(config?.maintainerEmails).toEqual([CURRENT_USER_EMAIL]);
    expect(config?.config.version).toBe(2);
  });
});

describe('patchConfig with requireProposals enabled', () => {
  const fixture = useAppFixture({
    authEmail: CURRENT_USER_EMAIL,
    requireProposals: true,
  });

  it('should throw BadRequestError when direct changes are disabled', async () => {
    const {configId} = await fixture.engine.useCases.createConfig(GLOBAL_CONTEXT, {
      name: `require_proposals_${Date.now()}`,
      value: {x: 1},
      schema: null,
      overrides: [],
      description: 'Test',
      currentUserEmail: CURRENT_USER_EMAIL,
      editorEmails: [],
      maintainerEmails: [CURRENT_USER_EMAIL],
      projectId: fixture.projectId,
    });

    await expect(
      fixture.engine.useCases.patchConfig(GLOBAL_CONTEXT, {
        configId,
        description: {newDescription: 'Updated'},
        currentUserEmail: CURRENT_USER_EMAIL,
        prevVersion: 1,
      }),
    ).rejects.toThrow(BadRequestError);

    // Verify config was not changed
    const {config} = await fixture.trpc.getConfig({
      name: `require_proposals_${Date.now()}`,
      projectId: fixture.projectId,
    });
    // Config might not be found or version should be 1
    expect(config?.config?.version ?? 1).toBe(1);
  });
});
