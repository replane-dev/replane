import type {ConfigProposalApprovedAuditLogPayload} from '@/engine/core/audit-log-store';
import {GLOBAL_CONTEXT} from '@/engine/core/context';
import {BadRequestError, ForbiddenError} from '@/engine/core/errors';
import {normalizeEmail} from '@/engine/core/utils';
import {createUuidV4} from '@/engine/core/uuid';
import {beforeEach, describe, expect, it} from 'vitest';
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

  it('should approve a proposal with proposed description only', async () => {
    const {configId} = await fixture.engine.useCases.createConfig(GLOBAL_CONTEXT, {
      overrides: [],
      name: 'approve_description_only',
      value: {x: 1},
      schema: null,
      description: 'Old description',
      currentUserEmail: CURRENT_USER_EMAIL,
      editorEmails: [],
      maintainerEmails: [CURRENT_USER_EMAIL, OTHER_USER_EMAIL],
      projectId: fixture.projectId,
    });

    const {configProposalId} = await fixture.engine.useCases.createConfigProposal(GLOBAL_CONTEXT, {
      baseVersion: 1,
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

    expect(config?.config.description).toBe('New description');
    expect(config?.config.version).toBe(2);
  });

  it('should approve a proposal with member changes', async () => {
    const {configId} = await fixture.engine.useCases.createConfig(GLOBAL_CONTEXT, {
      overrides: [],
      name: 'approve_members',
      value: 'test',
      schema: null,
      description: 'Test',
      currentUserEmail: CURRENT_USER_EMAIL,
      editorEmails: [],
      maintainerEmails: [CURRENT_USER_EMAIL, OTHER_USER_EMAIL],
      projectId: fixture.projectId,
    });

    const newMemberEmail = normalizeEmail('newmember@example.com');
    const {configProposalId} = await fixture.engine.useCases.createConfigProposal(GLOBAL_CONTEXT, {
      baseVersion: 1,
      configId,
      proposedMembers: {newMembers: [{email: newMemberEmail, role: 'editor'}]},
      currentUserEmail: CURRENT_USER_EMAIL,
    });

    await fixture.engine.useCases.approveConfigProposal(GLOBAL_CONTEXT, {
      proposalId: configProposalId,
      currentUserEmail: OTHER_USER_EMAIL,
    });

    const {config} = await fixture.trpc.getConfig({
      name: 'approve_members',
      projectId: fixture.projectId,
    });

    expect(config?.editorEmails).toContain(newMemberEmail);
  });

  it('should approve a deletion proposal', async () => {
    const {configId} = await fixture.engine.useCases.createConfig(GLOBAL_CONTEXT, {
      overrides: [],
      name: 'approve_deletion',
      value: {x: 1},
      schema: null,
      description: 'To be deleted',
      currentUserEmail: CURRENT_USER_EMAIL,
      editorEmails: [],
      maintainerEmails: [CURRENT_USER_EMAIL, OTHER_USER_EMAIL],
      projectId: fixture.projectId,
    });

    const {configProposalId} = await fixture.engine.useCases.createConfigProposal(GLOBAL_CONTEXT, {
      baseVersion: 1,
      configId,
      proposedDelete: true,
      currentUserEmail: CURRENT_USER_EMAIL,
    });

    await fixture.engine.useCases.approveConfigProposal(GLOBAL_CONTEXT, {
      proposalId: configProposalId,
      currentUserEmail: OTHER_USER_EMAIL,
    });

    // Config should be deleted
    const {config} = await fixture.trpc.getConfig({
      name: 'approve_deletion',
      projectId: fixture.projectId,
    });
    expect(config).toBeUndefined();
  });

  it('should reject other pending proposals when approving', async () => {
    const {configId} = await fixture.engine.useCases.createConfig(GLOBAL_CONTEXT, {
      overrides: [],
      name: 'reject_others_on_approve',
      value: {x: 1},
      schema: null,
      description: 'Initial',
      currentUserEmail: CURRENT_USER_EMAIL,
      editorEmails: [],
      maintainerEmails: [CURRENT_USER_EMAIL, OTHER_USER_EMAIL, THIRD_USER_EMAIL],
      projectId: fixture.projectId,
    });

    // Create two proposals
    const {configProposalId: proposal1} = await fixture.engine.useCases.createConfigProposal(
      GLOBAL_CONTEXT,
      {
        baseVersion: 1,
        configId,
        proposedDescription: {newDescription: 'Proposal 1'},
        currentUserEmail: CURRENT_USER_EMAIL,
      },
    );

    const {configProposalId: proposal2} = await fixture.engine.useCases.createConfigProposal(
      GLOBAL_CONTEXT,
      {
        baseVersion: 1,
        configId,
        proposedDescription: {newDescription: 'Proposal 2'},
        currentUserEmail: THIRD_USER_EMAIL,
      },
    );

    // Approve proposal 1
    await fixture.engine.useCases.approveConfigProposal(GLOBAL_CONTEXT, {
      proposalId: proposal1,
      currentUserEmail: OTHER_USER_EMAIL,
    });

    // Proposal 2 should be rejected
    const rejectedProposal = await fixture.engine.testing.configProposals.getById(proposal2);
    expect(rejectedProposal?.rejectedAt).not.toBeNull();
    expect(rejectedProposal?.rejectionReason).toBe('another_proposal_approved');
    expect(rejectedProposal?.rejectedInFavorOfProposalId).toBe(proposal1);
  });

  it('should throw BadRequestError for non-existent proposal', async () => {
    await expect(
      fixture.engine.useCases.approveConfigProposal(GLOBAL_CONTEXT, {
        proposalId: createUuidV4(),
        currentUserEmail: CURRENT_USER_EMAIL,
      }),
    ).rejects.toBeInstanceOf(BadRequestError);
  });

  it('should throw BadRequestError for already approved proposal', async () => {
    const {configId} = await fixture.engine.useCases.createConfig(GLOBAL_CONTEXT, {
      overrides: [],
      name: 'already_approved',
      value: 'test',
      schema: null,
      description: 'Test',
      currentUserEmail: CURRENT_USER_EMAIL,
      editorEmails: [],
      maintainerEmails: [CURRENT_USER_EMAIL, OTHER_USER_EMAIL],
      projectId: fixture.projectId,
    });

    const {configProposalId} = await fixture.engine.useCases.createConfigProposal(GLOBAL_CONTEXT, {
      baseVersion: 1,
      configId,
      proposedDescription: {newDescription: 'Updated'},
      currentUserEmail: CURRENT_USER_EMAIL,
    });

    await fixture.engine.useCases.approveConfigProposal(GLOBAL_CONTEXT, {
      proposalId: configProposalId,
      currentUserEmail: OTHER_USER_EMAIL,
    });

    await expect(
      fixture.engine.useCases.approveConfigProposal(GLOBAL_CONTEXT, {
        proposalId: configProposalId,
        currentUserEmail: OTHER_USER_EMAIL,
      }),
    ).rejects.toBeInstanceOf(BadRequestError);
  });

  it('should throw BadRequestError for already rejected proposal', async () => {
    const {configId} = await fixture.engine.useCases.createConfig(GLOBAL_CONTEXT, {
      overrides: [],
      name: 'already_rejected',
      value: 'test',
      schema: null,
      description: 'Test',
      currentUserEmail: CURRENT_USER_EMAIL,
      editorEmails: [],
      maintainerEmails: [CURRENT_USER_EMAIL, OTHER_USER_EMAIL],
      projectId: fixture.projectId,
    });

    const {configProposalId} = await fixture.engine.useCases.createConfigProposal(GLOBAL_CONTEXT, {
      baseVersion: 1,
      configId,
      proposedDescription: {newDescription: 'Updated'},
      currentUserEmail: CURRENT_USER_EMAIL,
    });

    await fixture.engine.useCases.rejectConfigProposal(GLOBAL_CONTEXT, {
      proposalId: configProposalId,
      currentUserEmail: OTHER_USER_EMAIL,
    });

    await expect(
      fixture.engine.useCases.approveConfigProposal(GLOBAL_CONTEXT, {
        proposalId: configProposalId,
        currentUserEmail: OTHER_USER_EMAIL,
      }),
    ).rejects.toBeInstanceOf(BadRequestError);
  });

  it('should create audit message for approval', async () => {
    const {configId} = await fixture.engine.useCases.createConfig(GLOBAL_CONTEXT, {
      overrides: [],
      name: 'audit_approve',
      value: 'test',
      schema: null,
      description: 'Initial',
      currentUserEmail: CURRENT_USER_EMAIL,
      editorEmails: [],
      maintainerEmails: [CURRENT_USER_EMAIL, OTHER_USER_EMAIL],
      projectId: fixture.projectId,
    });

    const {configProposalId} = await fixture.engine.useCases.createConfigProposal(GLOBAL_CONTEXT, {
      baseVersion: 1,
      configId,
      proposedDescription: {newDescription: 'Approved description'},
      currentUserEmail: CURRENT_USER_EMAIL,
    });

    await fixture.engine.useCases.approveConfigProposal(GLOBAL_CONTEXT, {
      proposalId: configProposalId,
      currentUserEmail: OTHER_USER_EMAIL,
    });

    const messages = await fixture.engine.testing.auditLogs.list({
      lte: new Date('2100-01-01T00:00:00Z'),
      limit: 50,
      orderBy: 'created_at desc, id desc',
      projectId: fixture.projectId,
    });

    const approvalMessage = messages.find(
      (m: any) => m.payload.type === 'config_proposal_approved',
    );
    expect(approvalMessage).toBeDefined();
    expect((approvalMessage?.payload as ConfigProposalApprovedAuditLogPayload).proposalId).toBe(
      configProposalId,
    );
    expect((approvalMessage?.payload as ConfigProposalApprovedAuditLogPayload).configId).toBe(
      configId,
    );
  });

  it('should throw BadRequestError when config version has changed', async () => {
    const {configId} = await fixture.engine.useCases.createConfig(GLOBAL_CONTEXT, {
      overrides: [],
      name: 'version_conflict',
      value: 'test',
      schema: null,
      description: 'Initial',
      currentUserEmail: CURRENT_USER_EMAIL,
      editorEmails: [],
      maintainerEmails: [CURRENT_USER_EMAIL, OTHER_USER_EMAIL],
      projectId: fixture.projectId,
    });

    // Create proposal at version 1
    const {configProposalId} = await fixture.engine.useCases.createConfigProposal(GLOBAL_CONTEXT, {
      baseVersion: 1,
      configId,
      proposedDescription: {newDescription: 'Proposed change'},
      currentUserEmail: OTHER_USER_EMAIL,
    });

    // Update config (version becomes 2)
    await fixture.engine.useCases.patchConfig(GLOBAL_CONTEXT, {
      configId,
      description: {newDescription: 'Direct update'},
      currentUserEmail: CURRENT_USER_EMAIL,
      prevVersion: 1,
    });

    // Trying to approve should fail due to version mismatch
    await expect(
      fixture.engine.useCases.approveConfigProposal(GLOBAL_CONTEXT, {
        proposalId: configProposalId,
        currentUserEmail: CURRENT_USER_EMAIL,
      }),
    ).rejects.toBeInstanceOf(BadRequestError);
  });
});

describe('approveConfigProposal (allowSelfApprovals=false)', () => {
  const fixture = useAppFixture({authEmail: CURRENT_USER_EMAIL, allowSelfApprovals: false});

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

  it('should prevent self-approval when allowSelfApprovals is false', async () => {
    const {configId} = await fixture.engine.useCases.createConfig(GLOBAL_CONTEXT, {
      overrides: [],
      name: 'no_self_approve',
      value: 'test',
      schema: null,
      description: 'Test',
      currentUserEmail: CURRENT_USER_EMAIL,
      editorEmails: [],
      maintainerEmails: [CURRENT_USER_EMAIL, OTHER_USER_EMAIL],
      projectId: fixture.projectId,
    });

    const {configProposalId} = await fixture.engine.useCases.createConfigProposal(GLOBAL_CONTEXT, {
      baseVersion: 1,
      configId,
      proposedDescription: {newDescription: 'Self proposed'},
      currentUserEmail: CURRENT_USER_EMAIL,
    });

    // Self-approval should be forbidden
    await expect(
      fixture.engine.useCases.approveConfigProposal(GLOBAL_CONTEXT, {
        proposalId: configProposalId,
        currentUserEmail: CURRENT_USER_EMAIL, // Same user who proposed
      }),
    ).rejects.toBeInstanceOf(ForbiddenError);

    // Approval by another user should work
    await fixture.engine.useCases.approveConfigProposal(GLOBAL_CONTEXT, {
      proposalId: configProposalId,
      currentUserEmail: OTHER_USER_EMAIL,
    });

    const {config} = await fixture.trpc.getConfig({
      name: 'no_self_approve',
      projectId: fixture.projectId,
    });
    expect(config?.config.description).toBe('Self proposed');
  });
});

describe('approveConfigProposal (allowSelfApprovals=true)', () => {
  const fixture = useAppFixture({authEmail: CURRENT_USER_EMAIL, allowSelfApprovals: true});

  it('should allow self-approval when allowSelfApprovals is true', async () => {
    const {configId} = await fixture.engine.useCases.createConfig(GLOBAL_CONTEXT, {
      overrides: [],
      name: 'self_approve_allowed',
      value: 'test',
      schema: null,
      description: 'Test',
      currentUserEmail: CURRENT_USER_EMAIL,
      editorEmails: [],
      maintainerEmails: [CURRENT_USER_EMAIL],
      projectId: fixture.projectId,
    });

    const {configProposalId} = await fixture.engine.useCases.createConfigProposal(GLOBAL_CONTEXT, {
      baseVersion: 1,
      configId,
      proposedDescription: {newDescription: 'Self approved'},
      currentUserEmail: CURRENT_USER_EMAIL,
    });

    // Self-approval should work
    await fixture.engine.useCases.approveConfigProposal(GLOBAL_CONTEXT, {
      proposalId: configProposalId,
      currentUserEmail: CURRENT_USER_EMAIL,
    });

    const {config} = await fixture.trpc.getConfig({
      name: 'self_approve_allowed',
      projectId: fixture.projectId,
    });
    expect(config?.config.description).toBe('Self approved');
  });
});
