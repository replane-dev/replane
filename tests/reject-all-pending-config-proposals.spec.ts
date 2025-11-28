import type {ConfigProposalRejectedAuditLogPayload} from '@/engine/core/audit-log-store';
import {GLOBAL_CONTEXT} from '@/engine/core/context';
import {BadRequestError} from '@/engine/core/errors';
import {normalizeEmail} from '@/engine/core/utils';
import {createUuidV4} from '@/engine/core/uuid';
import {assert, beforeEach, describe, expect, it} from 'vitest';
import {useAppFixture} from './fixtures/trpc-fixture';

const CURRENT_USER_EMAIL = normalizeEmail('test@example.com');
const OTHER_USER_EMAIL = normalizeEmail('other@example.com');
const THIRD_USER_EMAIL = normalizeEmail('third@example.com');

const OTHER_USER_ID = 2;
const THIRD_USER_ID = 3;

describe('rejectAllPendingConfigProposals', () => {
  const fixture = useAppFixture({authEmail: CURRENT_USER_EMAIL});

  beforeEach(async () => {
    const connection = await fixture.engine.testing.pool.connect();
    try {
      await connection.query(
        `INSERT INTO users(id, name, email, "emailVerified") VALUES ($1, 'Other', $2, NOW()), ($3, 'Third', $4, NOW())`,
        [OTHER_USER_ID, OTHER_USER_EMAIL, THIRD_USER_ID, THIRD_USER_EMAIL],
      );
    } finally {
      connection.release();
    }
  });

  it('should reject all pending proposals for a config', async () => {
    const {configId} = await fixture.engine.useCases.createConfig(GLOBAL_CONTEXT, {
      overrides: [],
      name: 'reject_all_test',
      value: {enabled: false},
      schema: null,
      description: 'Original description',
      currentUserEmail: CURRENT_USER_EMAIL,
      editorEmails: [],
      maintainerEmails: [CURRENT_USER_EMAIL, OTHER_USER_EMAIL, THIRD_USER_EMAIL],
      projectId: fixture.projectId,
    });

    // Create multiple config proposals (config-level: description and members)
    const {configProposalId: proposal1Id} = await fixture.engine.useCases.createConfigProposal(
      GLOBAL_CONTEXT,
      {
        baseVersion: 1,
        configId,
        proposedDescription: {newDescription: 'Description 1'},
        currentUserEmail: OTHER_USER_EMAIL,
      },
    );

    const {configProposalId: proposal2Id} = await fixture.engine.useCases.createConfigProposal(
      GLOBAL_CONTEXT,
      {
        baseVersion: 1,
        configId,
        proposedDescription: {newDescription: 'Description 2'},
        currentUserEmail: THIRD_USER_EMAIL,
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

    // Reject all pending proposals
    await fixture.engine.useCases.rejectAllPendingConfigProposals(GLOBAL_CONTEXT, {
      configId,
      currentUserEmail: CURRENT_USER_EMAIL,
    });

    // Verify all proposals are rejected
    const proposal1 = await fixture.engine.testing.configProposals.getById(proposal1Id);
    const proposal2 = await fixture.engine.testing.configProposals.getById(proposal2Id);
    const proposal3 = await fixture.engine.testing.configProposals.getById(proposal3Id);

    assert(proposal1 && proposal2 && proposal3);
    expect(proposal1.rejectedAt).toBeDefined();
    expect(proposal1.approvedAt).toBeNull();
    expect(proposal1.reviewerId).toBe(1); // CURRENT_USER_ID is 1
    expect(proposal1.rejectionReason).toBe('rejected_explicitly');

    expect(proposal2.rejectedAt).toBeDefined();
    expect(proposal2.approvedAt).toBeNull();
    expect(proposal2.reviewerId).toBe(1);
    expect(proposal2.rejectionReason).toBe('rejected_explicitly');

    expect(proposal3.rejectedAt).toBeDefined();
    expect(proposal3.approvedAt).toBeNull();
    expect(proposal3.reviewerId).toBe(1);
    expect(proposal3.rejectionReason).toBe('rejected_explicitly');

    // Verify no pending proposals remain
    const pendingAfter = await fixture.engine.testing.configProposals.getPendingProposals({
      configId,
    });
    expect(pendingAfter).toHaveLength(0);
  });

  it('should create audit messages for all rejected proposals', async () => {
    const {configId} = await fixture.engine.useCases.createConfig(GLOBAL_CONTEXT, {
      overrides: [],
      name: 'reject_all_audit',
      value: {enabled: false},
      schema: null,
      description: 'Original description',
      currentUserEmail: CURRENT_USER_EMAIL,
      editorEmails: [],
      maintainerEmails: [CURRENT_USER_EMAIL, OTHER_USER_EMAIL],
      projectId: fixture.projectId,
    });

    const {configProposalId: proposal1Id} = await fixture.engine.useCases.createConfigProposal(
      GLOBAL_CONTEXT,
      {
        baseVersion: 1,
        configId,
        proposedDescription: {newDescription: 'New description 1'},
        currentUserEmail: OTHER_USER_EMAIL,
      },
    );

    const {configProposalId: proposal2Id} = await fixture.engine.useCases.createConfigProposal(
      GLOBAL_CONTEXT,
      {
        baseVersion: 1,
        configId,
        proposedDescription: {newDescription: 'New description 2'},
        currentUserEmail: OTHER_USER_EMAIL,
      },
    );

    await fixture.engine.useCases.rejectAllPendingConfigProposals(GLOBAL_CONTEXT, {
      configId,
      currentUserEmail: CURRENT_USER_EMAIL,
    });

    // Verify audit messages
    const auditMessages = await fixture.engine.testing.auditLogs.list({
      lte: fixture.now,
      limit: 100,
      orderBy: 'created_at desc, id desc',
      projectId: fixture.projectId,
    });

    const rejectionMessages = auditMessages.filter(
      msg => msg.payload.type === 'config_proposal_rejected',
    ) as Array<{payload: ConfigProposalRejectedAuditLogPayload}>;

    expect(rejectionMessages).toHaveLength(2);

    const rejection1 = rejectionMessages.find(msg => msg.payload.proposalId === proposal1Id);
    const rejection2 = rejectionMessages.find(msg => msg.payload.proposalId === proposal2Id);

    assert(rejection1);
    assert(rejection2);

    expect(rejection1.payload).toMatchObject({
      type: 'config_proposal_rejected',
      proposalId: proposal1Id,
      configId,
      proposedDescription: 'New description 1',
    });

    expect(rejection2.payload).toMatchObject({
      type: 'config_proposal_rejected',
      proposalId: proposal2Id,
      configId,
      proposedDescription: 'New description 2',
    });
  });

  it('should handle proposals with different change types', async () => {
    const {configId} = await fixture.engine.useCases.createConfig(GLOBAL_CONTEXT, {
      overrides: [],
      name: 'reject_all_types',
      value: {enabled: false},
      schema: {type: 'object', properties: {enabled: {type: 'boolean'}}},
      description: 'Original description',
      currentUserEmail: CURRENT_USER_EMAIL,
      editorEmails: [],
      maintainerEmails: [CURRENT_USER_EMAIL, OTHER_USER_EMAIL],
      projectId: fixture.projectId,
    });

    // Config-level proposals: description, members, delete
    const {configProposalId: descriptionProposalId} =
      await fixture.engine.useCases.createConfigProposal(GLOBAL_CONTEXT, {
        baseVersion: 1,
        configId,
        proposedDescription: {newDescription: 'Updated description'},
        currentUserEmail: OTHER_USER_EMAIL,
      });

    const {configProposalId: membersProposalId} =
      await fixture.engine.useCases.createConfigProposal(GLOBAL_CONTEXT, {
        baseVersion: 1,
        configId,
        proposedMembers: {
          newMembers: [{email: THIRD_USER_EMAIL, role: 'editor'}],
        },
        currentUserEmail: OTHER_USER_EMAIL,
      });

    const {configProposalId: deleteProposalId} = await fixture.engine.useCases.createConfigProposal(
      GLOBAL_CONTEXT,
      {
        baseVersion: 1,
        configId,
        proposedDelete: true,
        currentUserEmail: OTHER_USER_EMAIL,
      },
    );

    await fixture.engine.useCases.rejectAllPendingConfigProposals(GLOBAL_CONTEXT, {
      configId,
      currentUserEmail: CURRENT_USER_EMAIL,
    });

    // Verify all proposals are rejected
    const descriptionProposal =
      await fixture.engine.testing.configProposals.getById(descriptionProposalId);
    const membersProposal = await fixture.engine.testing.configProposals.getById(membersProposalId);
    const deleteProposal = await fixture.engine.testing.configProposals.getById(deleteProposalId);

    assert(descriptionProposal && membersProposal && deleteProposal);
    expect(descriptionProposal.rejectedAt).toBeDefined();
    expect(membersProposal.rejectedAt).toBeDefined();
    expect(deleteProposal.rejectedAt).toBeDefined();

    // Verify audit messages include all proposal types
    const auditMessages = await fixture.engine.testing.auditLogs.list({
      lte: fixture.now,
      limit: 100,
      orderBy: 'created_at desc, id desc',
      projectId: fixture.projectId,
    });

    const rejectionMessages = auditMessages.filter(
      msg => msg.payload.type === 'config_proposal_rejected',
    ) as Array<{payload: ConfigProposalRejectedAuditLogPayload}>;

    expect(rejectionMessages.length).toBeGreaterThanOrEqual(3);

    const descriptionRejection = rejectionMessages.find(
      msg => msg.payload.proposalId === descriptionProposalId,
    );
    const membersRejection = rejectionMessages.find(
      msg => msg.payload.proposalId === membersProposalId,
    );
    const deleteRejection = rejectionMessages.find(
      msg => msg.payload.proposalId === deleteProposalId,
    );

    assert(descriptionRejection);
    assert(membersRejection);
    assert(deleteRejection);

    expect(descriptionRejection.payload.proposedDescription).toBeDefined();
    expect(membersRejection.payload.proposedMembers).toBeDefined();
    expect(deleteRejection.payload.proposedDelete).toBe(true);
  });

  it('should handle deletion proposals', async () => {
    const {configId} = await fixture.engine.useCases.createConfig(GLOBAL_CONTEXT, {
      overrides: [],
      name: 'reject_all_delete',
      value: {enabled: false},
      schema: null,
      description: 'Original description',
      currentUserEmail: CURRENT_USER_EMAIL,
      editorEmails: [],
      maintainerEmails: [CURRENT_USER_EMAIL, OTHER_USER_EMAIL],
      projectId: fixture.projectId,
    });

    const {configProposalId: deleteProposalId} = await fixture.engine.useCases.createConfigProposal(
      GLOBAL_CONTEXT,
      {
        baseVersion: 1,
        configId,
        proposedDelete: true,
        currentUserEmail: OTHER_USER_EMAIL,
      },
    );

    const {configProposalId: descProposalId} = await fixture.engine.useCases.createConfigProposal(
      GLOBAL_CONTEXT,
      {
        baseVersion: 1,
        configId,
        proposedDescription: {newDescription: 'New desc'},
        currentUserEmail: OTHER_USER_EMAIL,
      },
    );

    await fixture.engine.useCases.rejectAllPendingConfigProposals(GLOBAL_CONTEXT, {
      configId,
      currentUserEmail: CURRENT_USER_EMAIL,
    });

    // Verify both proposals are rejected
    const deleteProposal = await fixture.engine.testing.configProposals.getById(deleteProposalId);
    const descProposal = await fixture.engine.testing.configProposals.getById(descProposalId);

    assert(deleteProposal && descProposal);
    expect(deleteProposal.rejectedAt).toBeDefined();
    expect(descProposal.rejectedAt).toBeDefined();

    // Verify audit message for deletion proposal
    const auditMessages = await fixture.engine.testing.auditLogs.list({
      lte: fixture.now,
      limit: 100,
      orderBy: 'created_at desc, id desc',
      projectId: fixture.projectId,
    });

    const deleteRejection = auditMessages.find(
      msg =>
        msg.payload.type === 'config_proposal_rejected' &&
        msg.payload.proposalId === deleteProposalId,
    ) as {payload: ConfigProposalRejectedAuditLogPayload} | undefined;

    assert(deleteRejection);
    expect(deleteRejection.payload.proposedDelete).toBe(true);
  });

  it('should return successfully when there are no pending proposals', async () => {
    const {configId} = await fixture.engine.useCases.createConfig(GLOBAL_CONTEXT, {
      overrides: [],
      name: 'reject_all_empty',
      value: {enabled: false},
      schema: null,
      description: 'Original description',
      currentUserEmail: CURRENT_USER_EMAIL,
      editorEmails: [],
      maintainerEmails: [CURRENT_USER_EMAIL],
      projectId: fixture.projectId,
    });

    // Should not throw when there are no pending proposals
    await fixture.engine.useCases.rejectAllPendingConfigProposals(GLOBAL_CONTEXT, {
      configId,
      currentUserEmail: CURRENT_USER_EMAIL,
    });

    // Verify no audit messages were created for rejections
    const auditMessages = await fixture.engine.testing.auditLogs.list({
      lte: fixture.now,
      limit: 100,
      orderBy: 'created_at desc, id desc',
      projectId: fixture.projectId,
    });

    const rejectionMessages = auditMessages.filter(
      msg => msg.payload.type === 'config_proposal_rejected',
    );
    expect(rejectionMessages).toHaveLength(0);
  });

  it('should throw BadRequestError when config does not exist', async () => {
    const nonExistentConfigId = createUuidV4();

    await expect(
      fixture.engine.useCases.rejectAllPendingConfigProposals(GLOBAL_CONTEXT, {
        configId: nonExistentConfigId,
        currentUserEmail: CURRENT_USER_EMAIL,
      }),
    ).rejects.toThrow(BadRequestError);
  });

  it('should skip already approved proposals', async () => {
    const {configId} = await fixture.engine.useCases.createConfig(GLOBAL_CONTEXT, {
      overrides: [],
      name: 'reject_all_skip_approved',
      value: {enabled: false},
      schema: null,
      description: 'Original description',
      currentUserEmail: CURRENT_USER_EMAIL,
      editorEmails: [],
      maintainerEmails: [CURRENT_USER_EMAIL, OTHER_USER_EMAIL],
      projectId: fixture.projectId,
    });

    const {configProposalId: proposal1Id} = await fixture.engine.useCases.createConfigProposal(
      GLOBAL_CONTEXT,
      {
        baseVersion: 1,
        configId,
        proposedDescription: {newDescription: 'Description 1'},
        currentUserEmail: OTHER_USER_EMAIL,
      },
    );

    const {configProposalId: proposal2Id} = await fixture.engine.useCases.createConfigProposal(
      GLOBAL_CONTEXT,
      {
        baseVersion: 1,
        configId,
        proposedDescription: {newDescription: 'Description 2'},
        currentUserEmail: OTHER_USER_EMAIL,
      },
    );

    // Approve proposal 1
    await fixture.engine.useCases.approveConfigProposal(GLOBAL_CONTEXT, {
      proposalId: proposal1Id,
      currentUserEmail: CURRENT_USER_EMAIL,
    });

    // Reject all pending proposals (should only reject proposal 2)
    await fixture.engine.useCases.rejectAllPendingConfigProposals(GLOBAL_CONTEXT, {
      configId,
      currentUserEmail: CURRENT_USER_EMAIL,
    });

    // Verify proposal 1 is still approved
    const proposal1 = await fixture.engine.testing.configProposals.getById(proposal1Id);
    assert(proposal1);
    expect(proposal1.approvedAt).toBeDefined();
    expect(proposal1.rejectedAt).toBeNull();

    // Verify proposal 2 is rejected
    const proposal2 = await fixture.engine.testing.configProposals.getById(proposal2Id);
    assert(proposal2);
    expect(proposal2.rejectedAt).toBeDefined();
    expect(proposal2.approvedAt).toBeNull();
  });

  it('should skip already rejected proposals', async () => {
    const {configId} = await fixture.engine.useCases.createConfig(GLOBAL_CONTEXT, {
      overrides: [],
      name: 'reject_all_skip_rejected',
      value: {enabled: false},
      schema: null,
      description: 'Original description',
      currentUserEmail: CURRENT_USER_EMAIL,
      editorEmails: [],
      maintainerEmails: [CURRENT_USER_EMAIL, OTHER_USER_EMAIL],
      projectId: fixture.projectId,
    });

    const {configProposalId: proposal1Id} = await fixture.engine.useCases.createConfigProposal(
      GLOBAL_CONTEXT,
      {
        baseVersion: 1,
        configId,
        proposedDescription: {newDescription: 'Description 1'},
        currentUserEmail: OTHER_USER_EMAIL,
      },
    );

    const {configProposalId: proposal2Id} = await fixture.engine.useCases.createConfigProposal(
      GLOBAL_CONTEXT,
      {
        baseVersion: 1,
        configId,
        proposedDescription: {newDescription: 'Description 2'},
        currentUserEmail: OTHER_USER_EMAIL,
      },
    );

    // Manually reject proposal 1
    await fixture.engine.useCases.rejectConfigProposal(GLOBAL_CONTEXT, {
      proposalId: proposal1Id,
      currentUserEmail: CURRENT_USER_EMAIL,
    });

    // Reject all pending proposals (should only reject proposal 2)
    await fixture.engine.useCases.rejectAllPendingConfigProposals(GLOBAL_CONTEXT, {
      configId,
      currentUserEmail: CURRENT_USER_EMAIL,
    });

    // Verify proposal 1 is still rejected (not double-rejected)
    const proposal1 = await fixture.engine.testing.configProposals.getById(proposal1Id);
    assert(proposal1);
    expect(proposal1.rejectedAt).toBeDefined();

    // Verify proposal 2 is rejected
    const proposal2 = await fixture.engine.testing.configProposals.getById(proposal2Id);
    assert(proposal2);
    expect(proposal2.rejectedAt).toBeDefined();
  });

  it('should work via tRPC endpoint', async () => {
    const {configId} = await fixture.engine.useCases.createConfig(GLOBAL_CONTEXT, {
      overrides: [],
      name: 'reject_all_trpc',
      value: {enabled: false},
      schema: null,
      description: 'Original description',
      currentUserEmail: CURRENT_USER_EMAIL,
      editorEmails: [],
      maintainerEmails: [CURRENT_USER_EMAIL, OTHER_USER_EMAIL],
      projectId: fixture.projectId,
    });

    const {configProposalId: proposal1Id} = await fixture.engine.useCases.createConfigProposal(
      GLOBAL_CONTEXT,
      {
        baseVersion: 1,
        configId,
        proposedDescription: {newDescription: 'Description 1'},
        currentUserEmail: OTHER_USER_EMAIL,
      },
    );

    const {configProposalId: proposal2Id} = await fixture.engine.useCases.createConfigProposal(
      GLOBAL_CONTEXT,
      {
        baseVersion: 1,
        configId,
        proposedDescription: {newDescription: 'Description 2'},
        currentUserEmail: OTHER_USER_EMAIL,
      },
    );

    // Reject all via tRPC
    await fixture.trpc.rejectAllPendingConfigProposals({
      configId,
    });

    // Verify all proposals are rejected
    const proposal1 = await fixture.engine.testing.configProposals.getById(proposal1Id);
    const proposal2 = await fixture.engine.testing.configProposals.getById(proposal2Id);

    assert(proposal1 && proposal2);
    expect(proposal1.rejectedAt).toBeDefined();
    expect(proposal2.rejectedAt).toBeDefined();

    // Verify no pending proposals remain
    const pendingAfter = await fixture.engine.testing.configProposals.getPendingProposals({
      configId,
    });
    expect(pendingAfter).toHaveLength(0);
  });
});
