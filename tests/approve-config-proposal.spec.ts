import type {
  ConfigProposalApprovedAuditMessagePayload,
  ConfigProposalRejectedAuditMessagePayload,
} from '@/engine/core/audit-message-store';
import {GLOBAL_CONTEXT} from '@/engine/core/context';
import {BadRequestError, ForbiddenError} from '@/engine/core/errors';
import {normalizeEmail} from '@/engine/core/utils';
import {createUuidV4} from '@/engine/core/uuid';
import {assert, beforeEach, describe, expect, it} from 'vitest';
import {useAppFixture} from './fixtures/trpc-fixture';

const CURRENT_USER_EMAIL = normalizeEmail('test@example.com');
const OTHER_USER_EMAIL = normalizeEmail('other@example.com');
const THIRD_USER_EMAIL = normalizeEmail('third@example.com');

const OTHER_USER_ID = 2;
const THIRD_USER_ID = 3;

describe('approveConfigProposal', () => {
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

  it('should approve a proposal with proposed value only', async () => {
    const {configId} = await fixture.engine.useCases.createConfig(GLOBAL_CONTEXT, {
      name: 'approve_value_only',
      value: {count: 1},
      schema: {type: 'object', properties: {count: {type: 'number'}}},
      description: 'Initial',
      currentUserEmail: CURRENT_USER_EMAIL,
      editorEmails: [CURRENT_USER_EMAIL, OTHER_USER_EMAIL],
      ownerEmails: [],
      projectId: fixture.projectId,
    });

    const {configProposalId} = await fixture.engine.useCases.createConfigProposal(GLOBAL_CONTEXT, {
      configId,
      proposedValue: {newValue: {count: 5}},
      currentUserEmail: CURRENT_USER_EMAIL,
    });

    await fixture.engine.useCases.approveConfigProposal(GLOBAL_CONTEXT, {
      proposalId: configProposalId,
      currentUserEmail: OTHER_USER_EMAIL,
    });

    // Verify config was updated
    const {config} = await fixture.trpc.getConfig({
      name: 'approve_value_only',
      projectId: fixture.projectId,
    });

    expect(config?.config.value).toEqual({count: 5});
    expect(config?.config.description).toBe('Initial');
    expect(config?.config.version).toBe(2);

    // Verify proposal is no longer pending
    const proposals = await fixture.engine.testing.configProposals.getPendingProposals({configId});
    expect(proposals).toHaveLength(0);
  });

  it('should approve a proposal with proposed description only', async () => {
    const {configId} = await fixture.engine.useCases.createConfig(GLOBAL_CONTEXT, {
      name: 'approve_description_only',
      value: {x: 1},
      schema: null,
      description: 'Old description',
      currentUserEmail: CURRENT_USER_EMAIL,
      editorEmails: [CURRENT_USER_EMAIL, OTHER_USER_EMAIL],
      ownerEmails: [],
      projectId: fixture.projectId,
    });

    const {configProposalId} = await fixture.engine.useCases.createConfigProposal(GLOBAL_CONTEXT, {
      configId,
      proposedDescription: {newDescription: 'New description'},
      currentUserEmail: CURRENT_USER_EMAIL,
    });

    await fixture.engine.useCases.approveConfigProposal(GLOBAL_CONTEXT, {
      proposalId: configProposalId,
      currentUserEmail: OTHER_USER_EMAIL,
    });

    const {config} = await fixture.trpc.getConfig({
      name: 'approve_description_only',
      projectId: fixture.projectId,
    });

    expect(config?.config.value).toEqual({x: 1});
    expect(config?.config.description).toBe('New description');
    expect(config?.config.version).toBe(2);
  });

  it('should approve a proposal with proposed schema only', async () => {
    const {configId} = await fixture.engine.useCases.createConfig(GLOBAL_CONTEXT, {
      name: 'approve_schema_only',
      value: {x: 1},
      schema: {type: 'object', properties: {x: {type: 'number'}}},
      description: 'Test',
      currentUserEmail: CURRENT_USER_EMAIL,
      editorEmails: [CURRENT_USER_EMAIL],
      ownerEmails: [OTHER_USER_EMAIL],
      projectId: fixture.projectId,
    });

    const newSchema = {type: 'object', properties: {x: {type: 'number'}, y: {type: 'string'}}};
    const {configProposalId} = await fixture.engine.useCases.createConfigProposal(GLOBAL_CONTEXT, {
      configId,
      proposedSchema: {newSchema},
      currentUserEmail: CURRENT_USER_EMAIL,
    });

    await fixture.engine.useCases.approveConfigProposal(GLOBAL_CONTEXT, {
      proposalId: configProposalId,
      currentUserEmail: OTHER_USER_EMAIL,
    });

    const {config} = await fixture.trpc.getConfig({
      name: 'approve_schema_only',
      projectId: fixture.projectId,
    });

    expect(config?.config.schema).toEqual(newSchema);
    expect(config?.config.version).toBe(2);
  });

  it('should approve a proposal with multiple fields', async () => {
    const {configId} = await fixture.engine.useCases.createConfig(GLOBAL_CONTEXT, {
      name: 'approve_multiple',
      value: {count: 1},
      schema: {type: 'object', properties: {count: {type: 'number'}}},
      description: 'Initial',
      currentUserEmail: CURRENT_USER_EMAIL,
      editorEmails: [CURRENT_USER_EMAIL, OTHER_USER_EMAIL],
      ownerEmails: [],
      projectId: fixture.projectId,
    });

    const {configProposalId} = await fixture.engine.useCases.createConfigProposal(GLOBAL_CONTEXT, {
      configId,
      proposedValue: {newValue: {count: 10}},
      proposedDescription: {newDescription: 'Updated by proposal'},
      currentUserEmail: CURRENT_USER_EMAIL,
    });

    await fixture.engine.useCases.approveConfigProposal(GLOBAL_CONTEXT, {
      proposalId: configProposalId,
      currentUserEmail: OTHER_USER_EMAIL,
    });

    const {config} = await fixture.trpc.getConfig({
      name: 'approve_multiple',
      projectId: fixture.projectId,
    });

    expect(config?.config.value).toEqual({count: 10});
    expect(config?.config.description).toBe('Updated by proposal');
    expect(config?.config.version).toBe(2);
  });

  it('should reject all other pending proposals when approving one', async () => {
    const {configId} = await fixture.engine.useCases.createConfig(GLOBAL_CONTEXT, {
      name: 'approve_rejects_others',
      value: {x: 1},
      schema: null,
      description: 'Test',
      currentUserEmail: CURRENT_USER_EMAIL,
      editorEmails: [CURRENT_USER_EMAIL, OTHER_USER_EMAIL],
      ownerEmails: [],
      projectId: fixture.projectId,
    });

    // Create three proposals
    const {configProposalId: proposal1Id} = await fixture.engine.useCases.createConfigProposal(
      GLOBAL_CONTEXT,
      {
        configId,
        proposedValue: {newValue: {x: 2}},
        currentUserEmail: CURRENT_USER_EMAIL,
      },
    );

    const {configProposalId: proposal2Id} = await fixture.engine.useCases.createConfigProposal(
      GLOBAL_CONTEXT,
      {
        configId,
        proposedValue: {newValue: {x: 3}},
        currentUserEmail: CURRENT_USER_EMAIL,
      },
    );

    const {configProposalId: proposal3Id} = await fixture.engine.useCases.createConfigProposal(
      GLOBAL_CONTEXT,
      {
        configId,
        proposedValue: {newValue: {x: 4}},
        currentUserEmail: CURRENT_USER_EMAIL,
      },
    );

    // Verify all are pending
    const pendingBefore = await fixture.engine.testing.configProposals.getPendingProposals({
      configId,
    });
    expect(pendingBefore).toHaveLength(3);

    // Approve proposal 2 (using OTHER_USER to avoid self-approval)
    await fixture.engine.useCases.approveConfigProposal(GLOBAL_CONTEXT, {
      proposalId: proposal2Id,
      currentUserEmail: OTHER_USER_EMAIL,
    });

    // Verify no pending proposals remain
    const pendingAfter = await fixture.engine.testing.configProposals.getPendingProposals({
      configId,
    });
    expect(pendingAfter).toHaveLength(0);

    // Verify proposals 1 and 3 are rejected in favor of proposal 2
    const rejectedProposal1 = await fixture.engine.testing.configProposals.getById(proposal1Id);
    assert(rejectedProposal1, 'Proposal 1 should exist');
    expect(rejectedProposal1.approvedAt).toBeNull();
    expect(rejectedProposal1.rejectedAt).not.toBeNull();
    expect(rejectedProposal1.reviewerId).toBe(OTHER_USER_ID);
    expect(rejectedProposal1.rejectedInFavorOfProposalId).toBe(proposal2Id);

    const rejectedProposal3 = await fixture.engine.testing.configProposals.getById(proposal3Id);
    assert(rejectedProposal3, 'Proposal 3 should exist');
    expect(rejectedProposal3.approvedAt).toBeNull();
    expect(rejectedProposal3.rejectedAt).not.toBeNull();
    expect(rejectedProposal3.reviewerId).toBe(OTHER_USER_ID);
    expect(rejectedProposal3.rejectedInFavorOfProposalId).toBe(proposal2Id);

    // Verify config has proposal 2's value
    const {config} = await fixture.trpc.getConfig({
      name: 'approve_rejects_others',
      projectId: fixture.projectId,
    });
    expect(config?.config.value).toEqual({x: 3});
  });

  it('should create rejection audit messages for other proposals', async () => {
    const {configId} = await fixture.engine.useCases.createConfig(GLOBAL_CONTEXT, {
      name: 'approve_audit_rejection',
      value: {x: 1},
      schema: null,
      description: 'Test',
      currentUserEmail: CURRENT_USER_EMAIL,
      editorEmails: [CURRENT_USER_EMAIL, OTHER_USER_EMAIL],
      ownerEmails: [],
      projectId: fixture.projectId,
    });

    const {configProposalId: proposal1Id} = await fixture.engine.useCases.createConfigProposal(
      GLOBAL_CONTEXT,
      {
        configId,
        proposedValue: {newValue: {x: 2}},
        currentUserEmail: CURRENT_USER_EMAIL,
      },
    );

    const {configProposalId: proposal2Id} = await fixture.engine.useCases.createConfigProposal(
      GLOBAL_CONTEXT,
      {
        configId,
        proposedValue: {newValue: {x: 3}},
        currentUserEmail: CURRENT_USER_EMAIL,
      },
    );

    // Get audit messages before approval
    const auditMessagesBefore = await fixture.engine.testing.auditMessages.list({
      lte: fixture.now,
      limit: 100,
      orderBy: 'created_at desc, id desc',
      projectId: fixture.projectId,
    });
    const beforeCount = auditMessagesBefore.length;

    // Approve proposal 2 (using OTHER_USER to avoid self-approval)
    await fixture.engine.useCases.approveConfigProposal(GLOBAL_CONTEXT, {
      proposalId: proposal2Id,
      currentUserEmail: OTHER_USER_EMAIL,
    });

    // Get audit messages after approval
    const auditMessagesAfter = await fixture.engine.testing.auditMessages.list({
      lte: fixture.now,
      limit: 100,
      orderBy: 'created_at desc, id desc',
      projectId: fixture.projectId,
    });

    // Should have 2 rejection messages (for proposal 1 and 2) + 1 config_updated message
    expect(auditMessagesAfter.length).toBe(beforeCount + 3);

    // Find rejection audit messages
    const rejectionMessages = auditMessagesAfter.filter(
      msg => msg.payload.type === 'config_proposal_rejected',
    ) as Array<{payload: ConfigProposalRejectedAuditMessagePayload}>;

    expect(rejectionMessages).toHaveLength(1);

    const rejection = rejectionMessages[0];
    expect(rejection.payload.proposalId).toBe(proposal1Id);
    expect(rejection.payload.configId).toBe(configId);

    const approvalMessages = auditMessagesAfter.filter(
      msg => msg.payload.type === 'config_proposal_approved',
    ) as Array<{payload: ConfigProposalApprovedAuditMessagePayload}>;

    expect(approvalMessages).toHaveLength(1);

    // The approval message should match the approved proposal
    const approval = approvalMessages[0];
    expect(approval.payload.proposalId).toBe(proposal2Id);
    expect(approval.payload.configId).toBe(configId);
  });

  it('should throw error if proposal does not exist', async () => {
    await expect(
      fixture.engine.useCases.approveConfigProposal(GLOBAL_CONTEXT, {
        proposalId: createUuidV4(),
        currentUserEmail: CURRENT_USER_EMAIL,
      }),
    ).rejects.toThrow(BadRequestError);
  });

  it('should throw error if proposal was already approved', async () => {
    const {configId} = await fixture.engine.useCases.createConfig(GLOBAL_CONTEXT, {
      name: 'already_approved',
      value: {x: 1},
      schema: null,
      description: 'Test',
      currentUserEmail: CURRENT_USER_EMAIL,
      editorEmails: [CURRENT_USER_EMAIL, OTHER_USER_EMAIL],
      ownerEmails: [],
      projectId: fixture.projectId,
    });

    const {configProposalId} = await fixture.engine.useCases.createConfigProposal(GLOBAL_CONTEXT, {
      configId,
      proposedValue: {newValue: {x: 2}},
      currentUserEmail: CURRENT_USER_EMAIL,
    });

    // Approve once (using OTHER_USER to avoid self-approval)
    await fixture.engine.useCases.approveConfigProposal(GLOBAL_CONTEXT, {
      proposalId: configProposalId,
      currentUserEmail: OTHER_USER_EMAIL,
    });

    // Try to approve again
    await expect(
      fixture.engine.useCases.approveConfigProposal(GLOBAL_CONTEXT, {
        proposalId: configProposalId,
        currentUserEmail: CURRENT_USER_EMAIL,
      }),
    ).rejects.toThrow(ForbiddenError);
  });

  it('should throw error if proposal was already rejected', async () => {
    const {configId} = await fixture.engine.useCases.createConfig(GLOBAL_CONTEXT, {
      name: 'already_rejected',
      value: {x: 1},
      schema: null,
      description: 'Test',
      currentUserEmail: CURRENT_USER_EMAIL,
      editorEmails: [CURRENT_USER_EMAIL, OTHER_USER_EMAIL],
      ownerEmails: [],
      projectId: fixture.projectId,
    });

    const {configProposalId: proposal1Id} = await fixture.engine.useCases.createConfigProposal(
      GLOBAL_CONTEXT,
      {
        configId,
        proposedValue: {newValue: {x: 2}},
        currentUserEmail: CURRENT_USER_EMAIL,
      },
    );

    const {configProposalId: proposal2Id} = await fixture.engine.useCases.createConfigProposal(
      GLOBAL_CONTEXT,
      {
        configId,
        proposedValue: {newValue: {x: 3}},
        currentUserEmail: CURRENT_USER_EMAIL,
      },
    );

    // Approve proposal 2, which will reject proposal 1 (using OTHER_USER to avoid self-approval)
    await fixture.engine.useCases.approveConfigProposal(GLOBAL_CONTEXT, {
      proposalId: proposal2Id,
      currentUserEmail: OTHER_USER_EMAIL,
    });

    // Try to approve the rejected proposal
    await expect(
      fixture.engine.useCases.approveConfigProposal(GLOBAL_CONTEXT, {
        proposalId: proposal1Id,
        currentUserEmail: CURRENT_USER_EMAIL,
      }),
    ).rejects.toThrow(ForbiddenError);
  });

  it('should throw error if user does not have edit permission', async () => {
    const {configId} = await fixture.engine.useCases.createConfig(GLOBAL_CONTEXT, {
      name: 'no_permission',
      value: {x: 1},
      schema: null,
      description: 'Test',
      currentUserEmail: CURRENT_USER_EMAIL,
      editorEmails: [CURRENT_USER_EMAIL],
      ownerEmails: [],
      projectId: fixture.projectId,
    });

    const {configProposalId} = await fixture.engine.useCases.createConfigProposal(GLOBAL_CONTEXT, {
      configId,
      proposedValue: {newValue: {x: 2}},
      currentUserEmail: CURRENT_USER_EMAIL,
    });

    // Try to approve as a different user without permissions
    await expect(
      fixture.engine.useCases.approveConfigProposal(GLOBAL_CONTEXT, {
        proposalId: configProposalId,
        currentUserEmail: OTHER_USER_EMAIL,
      }),
    ).rejects.toThrow(ForbiddenError);
  });

  it('should throw error if config version has changed since proposal was created', async () => {
    const {configId} = await fixture.engine.useCases.createConfig(GLOBAL_CONTEXT, {
      name: 'version_conflict',
      value: {count: 1},
      schema: {type: 'object', properties: {count: {type: 'number'}}},
      description: 'Initial',
      currentUserEmail: CURRENT_USER_EMAIL,
      editorEmails: [CURRENT_USER_EMAIL, OTHER_USER_EMAIL],
      ownerEmails: [],
      projectId: fixture.projectId,
    });

    const {configProposalId} = await fixture.engine.useCases.createConfigProposal(GLOBAL_CONTEXT, {
      configId,
      proposedValue: {newValue: {count: 5}},
      currentUserEmail: CURRENT_USER_EMAIL,
    });

    // Update config separately
    await fixture.engine.useCases.patchConfig(GLOBAL_CONTEXT, {
      configId,
      value: {newValue: {count: 3}},
      currentUserEmail: CURRENT_USER_EMAIL,
      prevVersion: 1,
    });

    // Try to approve proposal (should fail because version changed)
    await expect(
      fixture.engine.useCases.approveConfigProposal(GLOBAL_CONTEXT, {
        proposalId: configProposalId,
        currentUserEmail: OTHER_USER_EMAIL,
      }),
    ).rejects.toThrow(BadRequestError);
  });

  it('should handle schema removal proposal', async () => {
    const {configId} = await fixture.engine.useCases.createConfig(GLOBAL_CONTEXT, {
      name: 'schema_removal',
      value: {x: 1},
      schema: {type: 'object', properties: {x: {type: 'number'}}},
      description: 'Test',
      currentUserEmail: CURRENT_USER_EMAIL,
      editorEmails: [CURRENT_USER_EMAIL],
      ownerEmails: [OTHER_USER_EMAIL],
      projectId: fixture.projectId,
    });

    const {configProposalId} = await fixture.engine.useCases.createConfigProposal(GLOBAL_CONTEXT, {
      configId,
      proposedSchema: {newSchema: null},
      currentUserEmail: CURRENT_USER_EMAIL,
    });

    await fixture.engine.useCases.approveConfigProposal(GLOBAL_CONTEXT, {
      proposalId: configProposalId,
      currentUserEmail: OTHER_USER_EMAIL,
    });

    const {config} = await fixture.trpc.getConfig({
      name: 'schema_removal',
      projectId: fixture.projectId,
    });

    expect(config?.config.schema).toBeNull();
    expect(config?.config.version).toBe(2);
  });

  it('should throw error if proposer tries to approve their own proposal', async () => {
    const {configId} = await fixture.engine.useCases.createConfig(GLOBAL_CONTEXT, {
      name: 'self_approval_not_allowed',
      value: {x: 1},
      schema: null,
      description: 'Test',
      currentUserEmail: CURRENT_USER_EMAIL,
      editorEmails: [CURRENT_USER_EMAIL, OTHER_USER_EMAIL],
      ownerEmails: [],
      projectId: fixture.projectId,
    });

    // Create proposal as CURRENT_USER
    const {configProposalId} = await fixture.engine.useCases.createConfigProposal(GLOBAL_CONTEXT, {
      configId,
      proposedValue: {newValue: {x: 2}},
      currentUserEmail: CURRENT_USER_EMAIL,
    });

    // Try to approve as the same user (CURRENT_USER) who created it
    await expect(
      fixture.engine.useCases.approveConfigProposal(GLOBAL_CONTEXT, {
        proposalId: configProposalId,
        currentUserEmail: CURRENT_USER_EMAIL,
      }),
    ).rejects.toThrow(ForbiddenError);

    // Verify the proposal is still pending
    const proposals = await fixture.engine.testing.configProposals.getPendingProposals({configId});
    expect(proposals).toHaveLength(1);
    expect(proposals[0]?.id).toBe(configProposalId);

    // Verify that OTHER_USER can approve it
    await fixture.engine.useCases.approveConfigProposal(GLOBAL_CONTEXT, {
      proposalId: configProposalId,
      currentUserEmail: OTHER_USER_EMAIL,
    });

    // Verify config was updated
    const {config} = await fixture.trpc.getConfig({
      name: 'self_approval_not_allowed',
      projectId: fixture.projectId,
    });

    expect(config?.config.value).toEqual({x: 2});
    expect(config?.config.version).toBe(2);
  });

  it('should set approvedAt timestamp on the approved proposal', async () => {
    const {configId} = await fixture.engine.useCases.createConfig(GLOBAL_CONTEXT, {
      name: 'approved_at_set',
      value: {x: 1},
      schema: null,
      description: 'Test',
      currentUserEmail: CURRENT_USER_EMAIL,
      editorEmails: [CURRENT_USER_EMAIL, OTHER_USER_EMAIL],
      ownerEmails: [],
      projectId: fixture.projectId,
    });

    const {configProposalId} = await fixture.engine.useCases.createConfigProposal(GLOBAL_CONTEXT, {
      configId,
      proposedValue: {newValue: {x: 2}},
      currentUserEmail: CURRENT_USER_EMAIL,
    });

    // Verify proposal has no approvedAt initially
    const proposalBefore = await fixture.engine.testing.configProposals.getById(configProposalId);
    expect(proposalBefore?.approvedAt).toBeNull();
    expect(proposalBefore?.reviewerId).toBeNull();

    // Approve the proposal
    await fixture.engine.useCases.approveConfigProposal(GLOBAL_CONTEXT, {
      proposalId: configProposalId,
      currentUserEmail: OTHER_USER_EMAIL,
    });

    // Verify proposal now has approvedAt set
    const proposalAfter = await fixture.engine.testing.configProposals.getById(configProposalId);
    expect(proposalAfter?.approvedAt).not.toBeNull();
    expect(proposalAfter?.approvedAt).toBeInstanceOf(Date);
    expect(proposalAfter?.reviewerId).toBe(OTHER_USER_ID);
    expect(proposalAfter?.rejectedAt).toBeNull();
  });

  it('should create approval audit message', async () => {
    const {configId} = await fixture.engine.useCases.createConfig(GLOBAL_CONTEXT, {
      name: 'approval_audit_message',
      value: {count: 1},
      schema: {type: 'object', properties: {count: {type: 'number'}}},
      description: 'Initial',
      currentUserEmail: CURRENT_USER_EMAIL,
      editorEmails: [CURRENT_USER_EMAIL, OTHER_USER_EMAIL],
      ownerEmails: [],
      projectId: fixture.projectId,
    });

    const {configProposalId} = await fixture.engine.useCases.createConfigProposal(GLOBAL_CONTEXT, {
      configId,
      proposedValue: {newValue: {count: 5}},
      proposedDescription: {newDescription: 'Updated description'},
      currentUserEmail: CURRENT_USER_EMAIL,
    });

    // Get audit messages before approval
    const auditMessagesBefore = await fixture.engine.testing.auditMessages.list({
      lte: fixture.now,
      limit: 100,
      orderBy: 'created_at desc, id desc',
      projectId: fixture.projectId,
    });
    const beforeCount = auditMessagesBefore.length;

    // Approve the proposal
    await fixture.engine.useCases.approveConfigProposal(GLOBAL_CONTEXT, {
      proposalId: configProposalId,
      currentUserEmail: OTHER_USER_EMAIL,
    });

    // Get audit messages after approval
    const auditMessagesAfter = await fixture.engine.testing.auditMessages.list({
      lte: fixture.now,
      limit: 100,
      orderBy: 'created_at desc, id desc',
      projectId: fixture.projectId,
    });

    // Should have 1 approval message + 1 config_updated message
    expect(auditMessagesAfter.length).toBeGreaterThanOrEqual(beforeCount + 2);

    // Find approval audit message
    const approvalMessage = auditMessagesAfter.find(
      msg => msg.payload.type === 'config_proposal_approved',
    ) as {payload: ConfigProposalApprovedAuditMessagePayload; userId: number | null} | undefined;

    expect(approvalMessage).toBeDefined();
    expect(approvalMessage?.payload.proposalId).toBe(configProposalId);
    expect(approvalMessage?.payload.configId).toBe(configId);
    expect(approvalMessage?.payload.proposedValue).toEqual({newValue: {count: 5}});
    expect(approvalMessage?.payload.proposedDescription).toBe('Updated description');
    expect(approvalMessage?.payload.proposedSchema).toBeUndefined();
    expect(approvalMessage?.userId).toBe(OTHER_USER_ID);
  });

  it('should create approval audit message with schema', async () => {
    const {configId} = await fixture.engine.useCases.createConfig(GLOBAL_CONTEXT, {
      name: 'approval_audit_with_schema',
      value: {x: 1},
      schema: {type: 'object', properties: {x: {type: 'number'}}},
      description: 'Test',
      currentUserEmail: CURRENT_USER_EMAIL,
      editorEmails: [CURRENT_USER_EMAIL],
      ownerEmails: [OTHER_USER_EMAIL],
      projectId: fixture.projectId,
    });

    const newSchema = {type: 'object', properties: {x: {type: 'number'}, y: {type: 'string'}}};
    const {configProposalId} = await fixture.engine.useCases.createConfigProposal(GLOBAL_CONTEXT, {
      configId,
      proposedSchema: {newSchema},
      currentUserEmail: CURRENT_USER_EMAIL,
    });

    await fixture.engine.useCases.approveConfigProposal(GLOBAL_CONTEXT, {
      proposalId: configProposalId,
      currentUserEmail: OTHER_USER_EMAIL,
    });

    // Get audit messages
    const auditMessages = await fixture.engine.testing.auditMessages.list({
      lte: fixture.now,
      limit: 100,
      orderBy: 'created_at desc, id desc',
      projectId: fixture.projectId,
    });

    // Find approval audit message
    const approvalMessage = auditMessages.find(
      msg => msg.payload.type === 'config_proposal_approved',
    ) as {payload: ConfigProposalApprovedAuditMessagePayload} | undefined;

    expect(approvalMessage).toBeDefined();
    expect(approvalMessage?.payload.proposalId).toBe(configProposalId);
    expect(approvalMessage?.payload.proposedSchema).toEqual({newSchema});
    expect(approvalMessage?.payload.proposedValue).toBeUndefined();
    expect(approvalMessage?.payload.proposedDescription).toBeUndefined();
  });

  it('should approve a deletion proposal and delete the config (owner required)', async () => {
    const {configId} = await fixture.engine.useCases.createConfig(GLOBAL_CONTEXT, {
      name: 'approve_delete_proposal',
      value: {x: 1},
      schema: null,
      description: 'To be deleted',
      currentUserEmail: CURRENT_USER_EMAIL,
      editorEmails: [CURRENT_USER_EMAIL],
      ownerEmails: [OTHER_USER_EMAIL],
      projectId: fixture.projectId,
    });

    const {configProposalId} = await fixture.engine.useCases.createConfigProposal(GLOBAL_CONTEXT, {
      configId,
      proposedDelete: true,
      currentUserEmail: CURRENT_USER_EMAIL,
    });

    // Non-owner (CURRENT_USER) cannot approve deletion
    await expect(
      fixture.engine.useCases.approveConfigProposal(GLOBAL_CONTEXT, {
        proposalId: configProposalId,
        currentUserEmail: CURRENT_USER_EMAIL,
      }),
    ).rejects.toThrow(ForbiddenError);

    // Owner (OTHER_USER) can approve deletion
    await fixture.engine.useCases.approveConfigProposal(GLOBAL_CONTEXT, {
      proposalId: configProposalId,
      currentUserEmail: OTHER_USER_EMAIL,
    });

    // Config should be deleted
    const {config} = await fixture.trpc.getConfig({
      name: 'approve_delete_proposal',
      projectId: fixture.projectId,
    });
    expect(config).toBeUndefined();
  });

  it('should throw error if non-editor tries to approve proposal with value change', async () => {
    const {configId} = await fixture.engine.useCases.createConfig(GLOBAL_CONTEXT, {
      name: 'value_change_requires_editor',
      value: {count: 1},
      schema: {type: 'object', properties: {count: {type: 'number'}}},
      description: 'Test',
      currentUserEmail: CURRENT_USER_EMAIL,
      editorEmails: [CURRENT_USER_EMAIL, OTHER_USER_EMAIL],
      ownerEmails: [],
      projectId: fixture.projectId,
    });

    // Create proposal with value change
    const {configProposalId} = await fixture.engine.useCases.createConfigProposal(GLOBAL_CONTEXT, {
      configId,
      proposedValue: {newValue: {count: 5}},
      currentUserEmail: CURRENT_USER_EMAIL,
    });

    // Try to approve as THIRD_USER who is not an editor
    await expect(
      fixture.engine.useCases.approveConfigProposal(GLOBAL_CONTEXT, {
        proposalId: configProposalId,
        currentUserEmail: THIRD_USER_EMAIL,
      }),
    ).rejects.toThrow(ForbiddenError);

    // Verify proposal is still pending
    const proposals = await fixture.engine.testing.configProposals.getPendingProposals({configId});
    expect(proposals).toHaveLength(1);

    // Verify OTHER_USER (who is an editor) can approve it
    await fixture.engine.useCases.approveConfigProposal(GLOBAL_CONTEXT, {
      proposalId: configProposalId,
      currentUserEmail: OTHER_USER_EMAIL,
    });

    const {config} = await fixture.trpc.getConfig({
      name: 'value_change_requires_editor',
      projectId: fixture.projectId,
    });
    expect(config?.config.value).toEqual({count: 5});
  });

  it('should throw error if non-owner tries to approve proposal with schema change', async () => {
    const {configId} = await fixture.engine.useCases.createConfig(GLOBAL_CONTEXT, {
      name: 'schema_change_requires_owner',
      value: {x: 1},
      schema: {type: 'object', properties: {x: {type: 'number'}}},
      description: 'Test',
      currentUserEmail: CURRENT_USER_EMAIL,
      editorEmails: [OTHER_USER_EMAIL],
      ownerEmails: [CURRENT_USER_EMAIL],
      projectId: fixture.projectId,
    });

    const newSchema = {type: 'object', properties: {x: {type: 'number'}, y: {type: 'string'}}};

    // Create proposal with schema change
    const {configProposalId} = await fixture.engine.useCases.createConfigProposal(GLOBAL_CONTEXT, {
      configId,
      proposedSchema: {newSchema},
      currentUserEmail: CURRENT_USER_EMAIL,
    });

    // Try to approve as OTHER_USER who is an editor but not an owner
    await expect(
      fixture.engine.useCases.approveConfigProposal(GLOBAL_CONTEXT, {
        proposalId: configProposalId,
        currentUserEmail: OTHER_USER_EMAIL,
      }),
    ).rejects.toThrow(ForbiddenError);

    // Verify proposal is still pending
    const proposals = await fixture.engine.testing.configProposals.getPendingProposals({configId});
    expect(proposals).toHaveLength(1);
  });

  it('should allow owner to approve proposal with schema change', async () => {
    const {configId} = await fixture.engine.useCases.createConfig(GLOBAL_CONTEXT, {
      name: 'owner_can_approve_schema',
      value: {x: 1},
      schema: {type: 'object', properties: {x: {type: 'number'}}},
      description: 'Test',
      currentUserEmail: CURRENT_USER_EMAIL,
      editorEmails: [],
      ownerEmails: [CURRENT_USER_EMAIL, OTHER_USER_EMAIL],
      projectId: fixture.projectId,
    });

    const newSchema = {type: 'object', properties: {x: {type: 'number'}, y: {type: 'string'}}};

    // Create proposal with schema change
    const {configProposalId} = await fixture.engine.useCases.createConfigProposal(GLOBAL_CONTEXT, {
      configId,
      proposedSchema: {newSchema},
      currentUserEmail: CURRENT_USER_EMAIL,
    });

    // Approve as OTHER_USER who is an owner
    await fixture.engine.useCases.approveConfigProposal(GLOBAL_CONTEXT, {
      proposalId: configProposalId,
      currentUserEmail: OTHER_USER_EMAIL,
    });

    // Verify schema was updated
    const {config} = await fixture.trpc.getConfig({
      name: 'owner_can_approve_schema',
      projectId: fixture.projectId,
    });
    expect(config?.config.schema).toEqual(newSchema);
    expect(config?.config.version).toBe(2);
  });

  it('should throw error if editor tries to approve proposal with schema removal', async () => {
    const {configId} = await fixture.engine.useCases.createConfig(GLOBAL_CONTEXT, {
      name: 'schema_removal_requires_owner',
      value: {x: 1},
      schema: {type: 'object', properties: {x: {type: 'number'}}},
      description: 'Test',
      currentUserEmail: CURRENT_USER_EMAIL,
      editorEmails: [OTHER_USER_EMAIL],
      ownerEmails: [CURRENT_USER_EMAIL],
      projectId: fixture.projectId,
    });

    // Create proposal to remove schema
    const {configProposalId} = await fixture.engine.useCases.createConfigProposal(GLOBAL_CONTEXT, {
      configId,
      proposedSchema: {newSchema: null},
      currentUserEmail: CURRENT_USER_EMAIL,
    });

    // Try to approve as OTHER_USER who is an editor but not an owner
    await expect(
      fixture.engine.useCases.approveConfigProposal(GLOBAL_CONTEXT, {
        proposalId: configProposalId,
        currentUserEmail: OTHER_USER_EMAIL,
      }),
    ).rejects.toThrow(ForbiddenError);

    // Verify proposal is still pending
    const proposals = await fixture.engine.testing.configProposals.getPendingProposals({configId});
    expect(proposals).toHaveLength(1);
  });

  it('should allow editor to approve proposal with description change only', async () => {
    const {configId} = await fixture.engine.useCases.createConfig(GLOBAL_CONTEXT, {
      name: 'editor_can_approve_description',
      value: {x: 1},
      schema: null,
      description: 'Original',
      currentUserEmail: CURRENT_USER_EMAIL,
      editorEmails: [CURRENT_USER_EMAIL, OTHER_USER_EMAIL],
      ownerEmails: [],
      projectId: fixture.projectId,
    });

    // Create proposal with description change only
    const {configProposalId} = await fixture.engine.useCases.createConfigProposal(GLOBAL_CONTEXT, {
      configId,
      proposedDescription: {newDescription: 'Updated description'},
      currentUserEmail: CURRENT_USER_EMAIL,
    });

    // Approve as OTHER_USER who is an editor (description changes don't require owner)
    await fixture.engine.useCases.approveConfigProposal(GLOBAL_CONTEXT, {
      proposalId: configProposalId,
      currentUserEmail: OTHER_USER_EMAIL,
    });

    // Verify description was updated
    const {config} = await fixture.trpc.getConfig({
      name: 'editor_can_approve_description',
      projectId: fixture.projectId,
    });
    expect(config?.config.description).toBe('Updated description');
    expect(config?.config.version).toBe(2);
  });
});
