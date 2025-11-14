import type {ConfigProposalRejectedAuditMessagePayload} from '@/engine/core/audit-message-store';
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

describe('rejectConfigProposal', () => {
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

  it('should reject a proposal with value change', async () => {
    const {configId} = await fixture.engine.useCases.createConfig(GLOBAL_CONTEXT, {
      name: 'reject_value',
      value: {enabled: false},
      schema: null,
      description: 'Original description',
      currentUserEmail: CURRENT_USER_EMAIL,
      editorEmails: [CURRENT_USER_EMAIL, OTHER_USER_EMAIL],
      ownerEmails: [],
      projectId: fixture.projectId,
    });

    const {configProposalId} = await fixture.engine.useCases.createConfigProposal(GLOBAL_CONTEXT, {
      baseVersion: 1,
      configId,
      proposedValue: {newValue: {enabled: true}},
      currentUserEmail: OTHER_USER_EMAIL,
    });

    await fixture.engine.useCases.rejectConfigProposal(GLOBAL_CONTEXT, {
      proposalId: configProposalId,
      currentUserEmail: CURRENT_USER_EMAIL,
    });

    // Verify proposal is rejected
    const proposal = await fixture.engine.testing.configProposals.getById(configProposalId);
    assert(proposal);
    expect(proposal.rejectedAt).toBeDefined();
    expect(proposal.approvedAt).toBeNull();
    expect(proposal.reviewerId).toBe(1); // CURRENT_USER_ID is 1
    expect(proposal.rejectionReason).toBe('rejected_explicitly');

    // Verify audit message
    const auditMessages = await fixture.engine.testing.auditMessages.list({
      lte: fixture.now,
      limit: 100,
      orderBy: 'created_at desc, id desc',
      projectId: fixture.projectId,
    });
    const rejectionMessage = auditMessages.find(
      msg =>
        msg.payload.type === 'config_proposal_rejected' &&
        msg.payload.proposalId === configProposalId,
    ) as {payload: ConfigProposalRejectedAuditMessagePayload} | undefined;
    assert(rejectionMessage);
    expect(rejectionMessage.payload).toMatchObject({
      type: 'config_proposal_rejected',
      proposalId: configProposalId,
      configId,
      proposedValue: {newValue: {enabled: true}},
    });
  });

  it('should reject a proposal with description change', async () => {
    const {configId} = await fixture.engine.useCases.createConfig(GLOBAL_CONTEXT, {
      name: 'reject_description',
      value: {enabled: false},
      schema: null,
      description: 'Original description',
      currentUserEmail: CURRENT_USER_EMAIL,
      editorEmails: [CURRENT_USER_EMAIL, OTHER_USER_EMAIL],
      ownerEmails: [],
      projectId: fixture.projectId,
    });

    const {configProposalId} = await fixture.engine.useCases.createConfigProposal(GLOBAL_CONTEXT, {
      baseVersion: 1,
      configId,
      proposedDescription: {newDescription: 'Updated description'},
      currentUserEmail: OTHER_USER_EMAIL,
    });

    await fixture.engine.useCases.rejectConfigProposal(GLOBAL_CONTEXT, {
      proposalId: configProposalId,
      currentUserEmail: CURRENT_USER_EMAIL,
    });

    // Verify proposal is rejected
    const proposal = await fixture.engine.testing.configProposals.getById(configProposalId);
    assert(proposal);
    expect(proposal.rejectedAt).toBeDefined();
    expect(proposal.approvedAt).toBeNull();

    // Verify audit message includes proposed description
    const auditMessages = await fixture.engine.testing.auditMessages.list({
      lte: fixture.now,
      limit: 100,
      orderBy: 'created_at desc, id desc',
      projectId: fixture.projectId,
    });
    const rejectionMessage = auditMessages.find(
      msg =>
        msg.payload.type === 'config_proposal_rejected' &&
        msg.payload.proposalId === configProposalId,
    ) as {payload: ConfigProposalRejectedAuditMessagePayload} | undefined;
    assert(rejectionMessage);
    expect(rejectionMessage.payload).toMatchObject({
      type: 'config_proposal_rejected',
      proposalId: configProposalId,
      configId,
      proposedDescription: 'Updated description',
    });
  });

  it('should reject a proposal with schema change', async () => {
    const {configId} = await fixture.engine.useCases.createConfig(GLOBAL_CONTEXT, {
      name: 'reject_schema',
      value: {enabled: false},
      schema: {type: 'object', properties: {enabled: {type: 'boolean'}}},
      description: 'Original description',
      currentUserEmail: CURRENT_USER_EMAIL,
      editorEmails: [CURRENT_USER_EMAIL],
      ownerEmails: [OTHER_USER_EMAIL],
      projectId: fixture.projectId,
    });

    const newSchema = {
      type: 'object',
      properties: {
        enabled: {type: 'boolean'},
        threshold: {type: 'number'},
      },
    };

    const {configProposalId} = await fixture.engine.useCases.createConfigProposal(GLOBAL_CONTEXT, {
      baseVersion: 1,
      configId,
      proposedSchema: {newSchema},
      currentUserEmail: OTHER_USER_EMAIL,
    });

    await fixture.engine.useCases.rejectConfigProposal(GLOBAL_CONTEXT, {
      proposalId: configProposalId,
      currentUserEmail: CURRENT_USER_EMAIL,
    });

    // Verify proposal is rejected
    const proposal = await fixture.engine.testing.configProposals.getById(configProposalId);
    assert(proposal);
    expect(proposal.rejectedAt).toBeDefined();

    // Verify audit message includes proposed schema
    const auditMessages = await fixture.engine.testing.auditMessages.list({
      lte: fixture.now,
      limit: 100,
      orderBy: 'created_at desc, id desc',
      projectId: fixture.projectId,
    });
    const rejectionMessage = auditMessages.find(
      msg =>
        msg.payload.type === 'config_proposal_rejected' &&
        msg.payload.proposalId === configProposalId,
    ) as {payload: ConfigProposalRejectedAuditMessagePayload} | undefined;
    assert(rejectionMessage);
    expect(rejectionMessage.payload.proposedSchema).toBeDefined();
  });

  it('should reject a proposal with multiple changes', async () => {
    const {configId} = await fixture.engine.useCases.createConfig(GLOBAL_CONTEXT, {
      name: 'reject_multiple',
      value: {enabled: false},
      schema: {type: 'object', properties: {enabled: {type: 'boolean'}}},
      description: 'Original description',
      currentUserEmail: CURRENT_USER_EMAIL,
      editorEmails: [CURRENT_USER_EMAIL],
      ownerEmails: [OTHER_USER_EMAIL],
      projectId: fixture.projectId,
    });

    const newSchema = {
      type: 'object',
      properties: {
        enabled: {type: 'boolean'},
      },
    };

    const {configProposalId} = await fixture.engine.useCases.createConfigProposal(GLOBAL_CONTEXT, {
      baseVersion: 1,
      configId,
      proposedValue: {newValue: {enabled: true}},
      proposedDescription: {newDescription: 'Updated description'},
      proposedSchema: {newSchema},
      currentUserEmail: OTHER_USER_EMAIL,
    });

    await fixture.engine.useCases.rejectConfigProposal(GLOBAL_CONTEXT, {
      proposalId: configProposalId,
      currentUserEmail: CURRENT_USER_EMAIL,
    });

    // Verify audit message includes all proposed changes
    const auditMessages = await fixture.engine.testing.auditMessages.list({
      lte: fixture.now,
      limit: 100,
      orderBy: 'created_at desc, id desc',
      projectId: fixture.projectId,
    });
    const rejectionMessage = auditMessages.find(
      msg =>
        msg.payload.type === 'config_proposal_rejected' &&
        msg.payload.proposalId === configProposalId,
    ) as {payload: ConfigProposalRejectedAuditMessagePayload} | undefined;
    assert(rejectionMessage);
    expect(rejectionMessage.payload).toMatchObject({
      type: 'config_proposal_rejected',
      proposalId: configProposalId,
      configId,
      proposedValue: {newValue: {enabled: true}},
      proposedDescription: 'Updated description',
    });
    expect(rejectionMessage.payload.proposedSchema).toBeDefined();
  });

  it('should set rejectedInFavorOfProposalId to undefined (explicit rejection)', async () => {
    const {configId} = await fixture.engine.useCases.createConfig(GLOBAL_CONTEXT, {
      name: 'reject_explicit',
      value: {enabled: false},
      schema: null,
      description: 'Original description',
      currentUserEmail: CURRENT_USER_EMAIL,
      editorEmails: [CURRENT_USER_EMAIL, OTHER_USER_EMAIL],
      ownerEmails: [],
      projectId: fixture.projectId,
    });

    const {configProposalId} = await fixture.engine.useCases.createConfigProposal(GLOBAL_CONTEXT, {
      baseVersion: 1,
      configId,
      proposedValue: {newValue: {enabled: true}},
      currentUserEmail: OTHER_USER_EMAIL,
    });

    await fixture.engine.useCases.rejectConfigProposal(GLOBAL_CONTEXT, {
      proposalId: configProposalId,
      currentUserEmail: CURRENT_USER_EMAIL,
    });

    // Verify audit message has undefined rejectedInFavorOfProposalId (explicit rejection)
    const auditMessages = await fixture.engine.testing.auditMessages.list({
      lte: fixture.now,
      limit: 100,
      orderBy: 'created_at desc, id desc',
      projectId: fixture.projectId,
    });
    const rejectionMessage = auditMessages.find(
      msg =>
        msg.payload.type === 'config_proposal_rejected' &&
        msg.payload.proposalId === configProposalId,
    ) as {payload: ConfigProposalRejectedAuditMessagePayload} | undefined;
    assert(rejectionMessage);
    expect(rejectionMessage.payload.rejectedInFavorOfProposalId).toBeUndefined();
  });

  it('should allow anyone to reject a proposal (no permission check)', async () => {
    // Create config with CURRENT_USER as owner, OTHER_USER as editor
    const {configId} = await fixture.engine.useCases.createConfig(GLOBAL_CONTEXT, {
      name: 'reject_no_permission',
      value: {enabled: false},
      schema: null,
      description: 'Original description',
      currentUserEmail: CURRENT_USER_EMAIL,
      editorEmails: [OTHER_USER_EMAIL],
      ownerEmails: [CURRENT_USER_EMAIL],
      projectId: fixture.projectId,
    });

    // Create proposal by THIRD_USER (who is not a member)
    const {configProposalId} = await fixture.engine.useCases.createConfigProposal(GLOBAL_CONTEXT, {
      baseVersion: 1,
      configId,
      proposedValue: {newValue: {enabled: true}},
      currentUserEmail: THIRD_USER_EMAIL,
    });

    // THIRD_USER can reject their own proposal (no permission check)
    await fixture.engine.useCases.rejectConfigProposal(GLOBAL_CONTEXT, {
      proposalId: configProposalId,
      currentUserEmail: THIRD_USER_EMAIL,
    });

    // Verify proposal is rejected
    const proposal = await fixture.engine.testing.configProposals.getById(configProposalId);
    assert(proposal);
    expect(proposal.rejectedAt).toBeDefined();
  });

  it('should allow multiple users to reject different proposals', async () => {
    const {configId} = await fixture.engine.useCases.createConfig(GLOBAL_CONTEXT, {
      name: 'reject_multiple_users',
      value: {enabled: false},
      schema: null,
      description: 'Original description',
      currentUserEmail: CURRENT_USER_EMAIL,
      editorEmails: [CURRENT_USER_EMAIL, OTHER_USER_EMAIL, THIRD_USER_EMAIL],
      ownerEmails: [],
      projectId: fixture.projectId,
    });

    // Create multiple proposals
    const {configProposalId: proposalId1} = await fixture.engine.useCases.createConfigProposal(
      GLOBAL_CONTEXT,
      {
        configId,
        baseVersion: 1,
        proposedValue: {newValue: {enabled: true}},
        currentUserEmail: OTHER_USER_EMAIL,
      },
    );

    const {configProposalId: proposalId2} = await fixture.engine.useCases.createConfigProposal(
      GLOBAL_CONTEXT,
      {
        configId,
        baseVersion: 1,
        proposedDescription: {newDescription: 'New description'},
        currentUserEmail: THIRD_USER_EMAIL,
      },
    );

    // Different users reject different proposals
    await fixture.engine.useCases.rejectConfigProposal(GLOBAL_CONTEXT, {
      proposalId: proposalId1,
      currentUserEmail: CURRENT_USER_EMAIL,
    });

    await fixture.engine.useCases.rejectConfigProposal(GLOBAL_CONTEXT, {
      proposalId: proposalId2,
      currentUserEmail: OTHER_USER_EMAIL,
    });

    // Verify both proposals are rejected
    const p1 = await fixture.engine.testing.configProposals.getById(proposalId1);
    const p2 = await fixture.engine.testing.configProposals.getById(proposalId2);
    assert(p1 && p2);
    expect(p1.rejectedAt).toBeDefined();
    expect(p2.rejectedAt).toBeDefined();
  });

  it('should throw BadRequestError when rejecting non-existent proposal', async () => {
    const nonExistentProposalId = createUuidV4();

    await expect(
      fixture.engine.useCases.rejectConfigProposal(GLOBAL_CONTEXT, {
        proposalId: nonExistentProposalId,
        currentUserEmail: CURRENT_USER_EMAIL,
      }),
    ).rejects.toThrow(BadRequestError);
  });

  it('should throw BadRequestError when rejecting already rejected proposal', async () => {
    const {configId} = await fixture.engine.useCases.createConfig(GLOBAL_CONTEXT, {
      name: 'reject_already_rejected',
      value: {enabled: false},
      schema: null,
      description: 'Original description',
      currentUserEmail: CURRENT_USER_EMAIL,
      editorEmails: [CURRENT_USER_EMAIL, OTHER_USER_EMAIL],
      ownerEmails: [],
      projectId: fixture.projectId,
    });

    const {configProposalId} = await fixture.engine.useCases.createConfigProposal(GLOBAL_CONTEXT, {
      baseVersion: 1,
      configId,
      proposedValue: {newValue: {enabled: true}},
      currentUserEmail: OTHER_USER_EMAIL,
    });

    // Reject proposal
    await fixture.engine.useCases.rejectConfigProposal(GLOBAL_CONTEXT, {
      proposalId: configProposalId,
      currentUserEmail: CURRENT_USER_EMAIL,
    });

    // Try to reject again
    await expect(
      fixture.engine.useCases.rejectConfigProposal(GLOBAL_CONTEXT, {
        proposalId: configProposalId,
        currentUserEmail: OTHER_USER_EMAIL,
      }),
    ).rejects.toThrow(BadRequestError);
  });

  it('should throw BadRequestError when rejecting already approved proposal', async () => {
    const {configId} = await fixture.engine.useCases.createConfig(GLOBAL_CONTEXT, {
      name: 'reject_already_approved',
      value: {enabled: false},
      schema: null,
      description: 'Original description',
      currentUserEmail: CURRENT_USER_EMAIL,
      editorEmails: [CURRENT_USER_EMAIL, OTHER_USER_EMAIL],
      ownerEmails: [],
      projectId: fixture.projectId,
    });

    const {configProposalId} = await fixture.engine.useCases.createConfigProposal(GLOBAL_CONTEXT, {
      baseVersion: 1,
      configId,
      proposedValue: {newValue: {enabled: true}},
      currentUserEmail: OTHER_USER_EMAIL,
    });

    // Approve proposal
    await fixture.engine.useCases.approveConfigProposal(GLOBAL_CONTEXT, {
      proposalId: configProposalId,
      currentUserEmail: CURRENT_USER_EMAIL,
    });

    // Try to reject
    await expect(
      fixture.engine.useCases.rejectConfigProposal(GLOBAL_CONTEXT, {
        proposalId: configProposalId,
        currentUserEmail: CURRENT_USER_EMAIL,
      }),
    ).rejects.toThrow(BadRequestError);
  });

  it('should set reviewerId when rejecting a proposal', async () => {
    const {configId} = await fixture.engine.useCases.createConfig(GLOBAL_CONTEXT, {
      name: 'reject_reviewer_id',
      value: {enabled: false},
      schema: null,
      description: 'Original description',
      currentUserEmail: CURRENT_USER_EMAIL,
      editorEmails: [CURRENT_USER_EMAIL, OTHER_USER_EMAIL],
      ownerEmails: [],
      projectId: fixture.projectId,
    });

    const {configProposalId} = await fixture.engine.useCases.createConfigProposal(GLOBAL_CONTEXT, {
      baseVersion: 1,
      configId,
      proposedValue: {newValue: {enabled: true}},
      currentUserEmail: OTHER_USER_EMAIL,
    });

    // Reject proposal
    await fixture.engine.useCases.rejectConfigProposal(GLOBAL_CONTEXT, {
      proposalId: configProposalId,
      currentUserEmail: CURRENT_USER_EMAIL,
    });

    // Verify proposal has reviewerId
    const proposal = await fixture.engine.testing.configProposals.getById(configProposalId);
    assert(proposal);
    expect(proposal.reviewerId).toBe(1); // CURRENT_USER_ID is 1
  });

  it('should not apply any changes to the config when rejecting', async () => {
    const {configId} = await fixture.engine.useCases.createConfig(GLOBAL_CONTEXT, {
      name: 'reject_no_changes',
      value: {enabled: false},
      schema: null,
      description: 'Original description',
      currentUserEmail: CURRENT_USER_EMAIL,
      editorEmails: [CURRENT_USER_EMAIL, OTHER_USER_EMAIL],
      ownerEmails: [],
      projectId: fixture.projectId,
    });

    const {config: originalConfig} = await fixture.trpc.getConfig({
      name: 'reject_no_changes',
      projectId: fixture.projectId,
    });
    const originalVersion = originalConfig?.config.version;

    const {configProposalId} = await fixture.engine.useCases.createConfigProposal(GLOBAL_CONTEXT, {
      baseVersion: 1,
      configId,
      proposedValue: {newValue: {enabled: true}},
      proposedDescription: {newDescription: 'New description'},
      currentUserEmail: OTHER_USER_EMAIL,
    });

    // Reject proposal
    await fixture.engine.useCases.rejectConfigProposal(GLOBAL_CONTEXT, {
      proposalId: configProposalId,
      currentUserEmail: CURRENT_USER_EMAIL,
    });

    // Verify config is unchanged
    const {config} = await fixture.trpc.getConfig({
      name: 'reject_no_changes',
      projectId: fixture.projectId,
    });
    expect(config?.config.value).toEqual({enabled: false});
    expect(config?.config.description).toBe('Original description');
    expect(config?.config.version).toBe(originalVersion); // Version should not change
  });

  it('should record the correct user as the rejector in audit message', async () => {
    const {configId} = await fixture.engine.useCases.createConfig(GLOBAL_CONTEXT, {
      name: 'reject_correct_user',
      value: {enabled: false},
      schema: null,
      description: 'Original description',
      currentUserEmail: CURRENT_USER_EMAIL,
      editorEmails: [CURRENT_USER_EMAIL, OTHER_USER_EMAIL],
      ownerEmails: [],
      projectId: fixture.projectId,
    });

    // Create proposal by OTHER_USER
    const {configProposalId} = await fixture.engine.useCases.createConfigProposal(GLOBAL_CONTEXT, {
      baseVersion: 1,
      configId,
      proposedValue: {newValue: {enabled: true}},
      currentUserEmail: OTHER_USER_EMAIL,
    });

    // Reject by CURRENT_USER
    await fixture.engine.useCases.rejectConfigProposal(GLOBAL_CONTEXT, {
      proposalId: configProposalId,
      currentUserEmail: CURRENT_USER_EMAIL,
    });

    // Verify audit message has correct userId (rejector, not proposer)
    const auditMessages = await fixture.engine.testing.auditMessages.list({
      lte: fixture.now,
      limit: 100,
      orderBy: 'created_at desc, id desc',
      projectId: fixture.projectId,
    });
    const rejectionMessage = auditMessages.find(
      msg =>
        msg.payload.type === 'config_proposal_rejected' &&
        msg.payload.proposalId === configProposalId,
    ) as {payload: ConfigProposalRejectedAuditMessagePayload; userId: number} | undefined;
    assert(rejectionMessage);
    expect(rejectionMessage.userId).toBe(1); // CURRENT_USER_ID is 1
  });
});
