import {GLOBAL_CONTEXT} from '@/engine/core/context';
import {BadRequestError} from '@/engine/core/errors';
import {normalizeEmail} from '@/engine/core/utils';
import {createUuidV4} from '@/engine/core/uuid';
import {beforeEach, describe, expect, it} from 'vitest';
import {useAppFixture} from './fixtures/trpc-fixture';

const CURRENT_USER_EMAIL = normalizeEmail('test@example.com');
const OTHER_USER_EMAIL = normalizeEmail('other@example.com');
const THIRD_USER_EMAIL = normalizeEmail('third@example.com');

const OTHER_USER_ID = 2;
const THIRD_USER_ID = 3;

describe('getConfigProposal', () => {
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

  it('should get a pending proposal with description change', async () => {
    const {configId} = await fixture.engine.useCases.createConfig(GLOBAL_CONTEXT, {
      overrides: [],
      name: 'get_proposal_description',
      value: {enabled: false},
      schema: null,
      description: 'Original description',
      currentUserEmail: CURRENT_USER_EMAIL,
      editorEmails: [],
      maintainerEmails: [CURRENT_USER_EMAIL, OTHER_USER_EMAIL],
      projectId: fixture.projectId,
    });

    const {configProposalId} = await fixture.engine.useCases.createConfigProposal(GLOBAL_CONTEXT, {
      baseVersion: 1,
      configId,
      proposedDescription: {newDescription: 'Updated description'},
      currentUserEmail: OTHER_USER_EMAIL,
    });

    const result = await fixture.engine.useCases.getConfigProposal(GLOBAL_CONTEXT, {
      projectId: fixture.projectId,
      proposalId: configProposalId,
      currentUserEmail: CURRENT_USER_EMAIL,
    });

    expect(result.proposal).toMatchObject({
      id: configProposalId,
      configId,
      configName: 'get_proposal_description',
      proposerId: OTHER_USER_ID,
      proposerEmail: OTHER_USER_EMAIL,
      status: 'pending',
      proposedDescription: 'Updated description',
      proposedDelete: false,
      proposedMembers: null,
      rejectedAt: null,
      approvedAt: null,
      reviewerId: null,
      reviewerEmail: null,
    });
    expect(result.proposal.createdAt).toBeDefined();
    expect(result.proposal.baseConfigVersion).toBe(1);
  });

  it('should indicate maintainers as approvers for member changes', async () => {
    const {configId} = await fixture.engine.useCases.createConfig(GLOBAL_CONTEXT, {
      overrides: [],
      name: 'get_proposal_members',
      value: {enabled: false},
      schema: null,
      description: 'Original description',
      currentUserEmail: CURRENT_USER_EMAIL,
      editorEmails: [],
      maintainerEmails: [CURRENT_USER_EMAIL, OTHER_USER_EMAIL],
      projectId: fixture.projectId,
    });

    const {configProposalId} = await fixture.engine.useCases.createConfigProposal(GLOBAL_CONTEXT, {
      baseVersion: 1,
      configId,
      proposedMembers: {newMembers: [{email: THIRD_USER_EMAIL, role: 'editor'}]},
      currentUserEmail: CURRENT_USER_EMAIL,
    });

    const result = await fixture.engine.useCases.getConfigProposal(GLOBAL_CONTEXT, {
      projectId: fixture.projectId,
      proposalId: configProposalId,
      currentUserEmail: CURRENT_USER_EMAIL,
    });

    expect(result.proposal.approverRole).toBe('maintainers');
    expect(result.proposal.approverReason).toBe('Membership changes require maintainer approval.');
  });

  it('should indicate maintainers as approvers for deletion proposals', async () => {
    const {configId} = await fixture.engine.useCases.createConfig(GLOBAL_CONTEXT, {
      overrides: [],
      name: 'get_proposal_delete',
      value: {enabled: false},
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
      currentUserEmail: OTHER_USER_EMAIL,
    });

    const result = await fixture.engine.useCases.getConfigProposal(GLOBAL_CONTEXT, {
      projectId: fixture.projectId,
      proposalId: configProposalId,
      currentUserEmail: CURRENT_USER_EMAIL,
    });

    expect(result.proposal.proposedDelete).toBe(true);
    expect(result.proposal.approverRole).toBe('maintainers');
    expect(result.proposal.approverReason).toBe('Deletion requests require maintainer approval.');
  });

  it('should get a pending proposal with member changes', async () => {
    const {configId} = await fixture.engine.useCases.createConfig(GLOBAL_CONTEXT, {
      overrides: [],
      name: 'get_proposal_member_changes',
      value: {enabled: false},
      schema: null,
      description: 'Original description',
      currentUserEmail: CURRENT_USER_EMAIL,
      editorEmails: [],
      maintainerEmails: [CURRENT_USER_EMAIL, OTHER_USER_EMAIL],
      projectId: fixture.projectId,
    });

    const {configProposalId} = await fixture.engine.useCases.createConfigProposal(GLOBAL_CONTEXT, {
      baseVersion: 1,
      configId,
      proposedMembers: {newMembers: [{email: THIRD_USER_EMAIL, role: 'editor'}]},
      currentUserEmail: OTHER_USER_EMAIL,
    });

    const result = await fixture.engine.useCases.getConfigProposal(GLOBAL_CONTEXT, {
      projectId: fixture.projectId,
      proposalId: configProposalId,
      currentUserEmail: CURRENT_USER_EMAIL,
    });

    expect(result.proposal).toMatchObject({
      id: configProposalId,
      configId,
      configName: 'get_proposal_member_changes',
      status: 'pending',
      proposedDescription: null,
      proposedMembers: {newMembers: [{email: THIRD_USER_EMAIL, role: 'editor'}]},
    });
  });

  it('should get a pending proposal with multiple changes', async () => {
    const {configId} = await fixture.engine.useCases.createConfig(GLOBAL_CONTEXT, {
      overrides: [],
      name: 'get_proposal_multiple',
      value: {enabled: false},
      schema: null,
      description: 'Original description',
      currentUserEmail: CURRENT_USER_EMAIL,
      editorEmails: [],
      maintainerEmails: [CURRENT_USER_EMAIL, OTHER_USER_EMAIL],
      projectId: fixture.projectId,
    });

    const {configProposalId} = await fixture.engine.useCases.createConfigProposal(GLOBAL_CONTEXT, {
      baseVersion: 1,
      configId,
      proposedDescription: {newDescription: 'Updated description'},
      proposedMembers: {newMembers: [{email: THIRD_USER_EMAIL, role: 'editor'}]},
      currentUserEmail: OTHER_USER_EMAIL,
    });

    const result = await fixture.engine.useCases.getConfigProposal(GLOBAL_CONTEXT, {
      projectId: fixture.projectId,
      proposalId: configProposalId,
      currentUserEmail: CURRENT_USER_EMAIL,
    });

    expect(result.proposal).toMatchObject({
      id: configProposalId,
      configId,
      configName: 'get_proposal_multiple',
      status: 'pending',
      proposedDescription: 'Updated description',
      proposedMembers: {newMembers: [{email: THIRD_USER_EMAIL, role: 'editor'}]},
    });
  });

  it('should get an approved proposal', async () => {
    const {configId} = await fixture.engine.useCases.createConfig(GLOBAL_CONTEXT, {
      overrides: [],
      name: 'get_proposal_approved',
      value: {enabled: false},
      schema: null,
      description: 'Original description',
      currentUserEmail: CURRENT_USER_EMAIL,
      editorEmails: [],
      maintainerEmails: [CURRENT_USER_EMAIL, OTHER_USER_EMAIL],
      projectId: fixture.projectId,
    });

    const {configProposalId} = await fixture.engine.useCases.createConfigProposal(GLOBAL_CONTEXT, {
      baseVersion: 1,
      configId,
      proposedDescription: {newDescription: 'New description'},
      currentUserEmail: OTHER_USER_EMAIL,
    });

    // Approve the proposal
    await fixture.engine.useCases.approveConfigProposal(GLOBAL_CONTEXT, {
      proposalId: configProposalId,
      currentUserEmail: CURRENT_USER_EMAIL,
    });

    const result = await fixture.engine.useCases.getConfigProposal(GLOBAL_CONTEXT, {
      projectId: fixture.projectId,
      proposalId: configProposalId,
      currentUserEmail: CURRENT_USER_EMAIL,
    });

    expect(result.proposal.status).toBe('approved');
    expect(result.proposal.approvedAt).toBeDefined();
    expect(result.proposal.reviewerId).toBe(1); // CURRENT_USER_ID
    expect(result.proposal.reviewerEmail).toBe(CURRENT_USER_EMAIL);
    expect(result.proposal.rejectedAt).toBeNull();
  });

  it('should get a rejected proposal', async () => {
    const {configId} = await fixture.engine.useCases.createConfig(GLOBAL_CONTEXT, {
      overrides: [],
      name: 'get_proposal_rejected',
      value: {enabled: false},
      schema: null,
      description: 'Original description',
      currentUserEmail: CURRENT_USER_EMAIL,
      editorEmails: [],
      maintainerEmails: [CURRENT_USER_EMAIL, OTHER_USER_EMAIL],
      projectId: fixture.projectId,
    });

    const {configProposalId} = await fixture.engine.useCases.createConfigProposal(GLOBAL_CONTEXT, {
      baseVersion: 1,
      configId,
      proposedDescription: {newDescription: 'New description'},
      currentUserEmail: OTHER_USER_EMAIL,
    });

    // Reject the proposal
    await fixture.engine.useCases.rejectConfigProposal(GLOBAL_CONTEXT, {
      proposalId: configProposalId,
      currentUserEmail: CURRENT_USER_EMAIL,
    });

    const result = await fixture.engine.useCases.getConfigProposal(GLOBAL_CONTEXT, {
      projectId: fixture.projectId,
      proposalId: configProposalId,
      currentUserEmail: CURRENT_USER_EMAIL,
    });

    expect(result.proposal.status).toBe('rejected');
    expect(result.proposal.rejectedAt).toBeDefined();
    expect(result.proposal.reviewerId).toBe(1); // CURRENT_USER_ID
    expect(result.proposal.reviewerEmail).toBe(CURRENT_USER_EMAIL);
    expect(result.proposal.approvedAt).toBeNull();
    expect(result.proposal.rejectedInFavorOfProposalId).toBeNull();
  });

  it('should get a rejected proposal with rejectedInFavorOfProposalId', async () => {
    const {configId} = await fixture.engine.useCases.createConfig(GLOBAL_CONTEXT, {
      overrides: [],
      name: 'get_proposal_rejected_in_favor',
      value: {enabled: false},
      schema: null,
      description: 'Original description',
      currentUserEmail: CURRENT_USER_EMAIL,
      editorEmails: [],
      maintainerEmails: [CURRENT_USER_EMAIL, OTHER_USER_EMAIL, THIRD_USER_EMAIL],
      projectId: fixture.projectId,
    });

    // Create two proposals
    const {configProposalId: proposal1Id} = await fixture.engine.useCases.createConfigProposal(
      GLOBAL_CONTEXT,
      {
        baseVersion: 1,
        configId,
        proposedDescription: {newDescription: 'First description'},
        currentUserEmail: OTHER_USER_EMAIL,
      },
    );

    const {configProposalId: proposal2Id} = await fixture.engine.useCases.createConfigProposal(
      GLOBAL_CONTEXT,
      {
        baseVersion: 1,
        configId,
        proposedDescription: {newDescription: 'Second description'},
        currentUserEmail: THIRD_USER_EMAIL,
      },
    );

    // Approve proposal 2 (which should reject proposal 1 in favor of proposal 2)
    await fixture.engine.useCases.approveConfigProposal(GLOBAL_CONTEXT, {
      proposalId: proposal2Id,
      currentUserEmail: CURRENT_USER_EMAIL,
    });

    // Get the rejected proposal
    const result = await fixture.engine.useCases.getConfigProposal(GLOBAL_CONTEXT, {
      projectId: fixture.projectId,
      proposalId: proposal1Id,
      currentUserEmail: CURRENT_USER_EMAIL,
    });

    expect(result.proposal.status).toBe('rejected');
    expect(result.proposal.rejectedAt).toBeDefined();
    expect(result.proposal.rejectedInFavorOfProposalId).toBe(proposal2Id);
  });

  it('should include proposer email when proposer exists', async () => {
    const {configId} = await fixture.engine.useCases.createConfig(GLOBAL_CONTEXT, {
      overrides: [],
      name: 'get_proposal_proposer',
      value: {enabled: false},
      schema: null,
      description: 'Original description',
      currentUserEmail: CURRENT_USER_EMAIL,
      editorEmails: [],
      maintainerEmails: [CURRENT_USER_EMAIL, OTHER_USER_EMAIL],
      projectId: fixture.projectId,
    });

    const {configProposalId} = await fixture.engine.useCases.createConfigProposal(GLOBAL_CONTEXT, {
      baseVersion: 1,
      configId,
      proposedDescription: {newDescription: 'New description'},
      currentUserEmail: OTHER_USER_EMAIL,
    });

    const result = await fixture.engine.useCases.getConfigProposal(GLOBAL_CONTEXT, {
      projectId: fixture.projectId,
      proposalId: configProposalId,
      currentUserEmail: CURRENT_USER_EMAIL,
    });

    expect(result.proposal.proposerId).toBe(OTHER_USER_ID);
    expect(result.proposal.proposerEmail).toBe(OTHER_USER_EMAIL);
  });

  it('should include reviewer email when proposal is reviewed', async () => {
    const {configId} = await fixture.engine.useCases.createConfig(GLOBAL_CONTEXT, {
      overrides: [],
      name: 'get_proposal_reviewer',
      value: {enabled: false},
      schema: null,
      description: 'Original description',
      currentUserEmail: CURRENT_USER_EMAIL,
      editorEmails: [],
      maintainerEmails: [CURRENT_USER_EMAIL, OTHER_USER_EMAIL],
      projectId: fixture.projectId,
    });

    const {configProposalId} = await fixture.engine.useCases.createConfigProposal(GLOBAL_CONTEXT, {
      baseVersion: 1,
      configId,
      proposedDescription: {newDescription: 'New description'},
      currentUserEmail: OTHER_USER_EMAIL,
    });

    await fixture.engine.useCases.approveConfigProposal(GLOBAL_CONTEXT, {
      proposalId: configProposalId,
      currentUserEmail: CURRENT_USER_EMAIL,
    });

    const result = await fixture.engine.useCases.getConfigProposal(GLOBAL_CONTEXT, {
      projectId: fixture.projectId,
      proposalId: configProposalId,
      currentUserEmail: CURRENT_USER_EMAIL,
    });

    expect(result.proposal.reviewerId).toBe(1); // CURRENT_USER_ID
    expect(result.proposal.reviewerEmail).toBe(CURRENT_USER_EMAIL);
  });

  it('should include config name in response', async () => {
    const {configId} = await fixture.engine.useCases.createConfig(GLOBAL_CONTEXT, {
      overrides: [],
      name: 'my_special_config',
      value: {enabled: false},
      schema: null,
      description: 'Original description',
      currentUserEmail: CURRENT_USER_EMAIL,
      editorEmails: [],
      maintainerEmails: [CURRENT_USER_EMAIL, OTHER_USER_EMAIL],
      projectId: fixture.projectId,
    });

    const {configProposalId} = await fixture.engine.useCases.createConfigProposal(GLOBAL_CONTEXT, {
      baseVersion: 1,
      configId,
      proposedDescription: {newDescription: 'New description'},
      currentUserEmail: OTHER_USER_EMAIL,
    });

    const result = await fixture.engine.useCases.getConfigProposal(GLOBAL_CONTEXT, {
      projectId: fixture.projectId,
      proposalId: configProposalId,
      currentUserEmail: CURRENT_USER_EMAIL,
    });

    expect(result.proposal.configName).toBe('my_special_config');
  });

  it('should throw BadRequestError for non-existent proposal', async () => {
    const nonExistentProposalId = createUuidV4();

    await expect(
      fixture.engine.useCases.getConfigProposal(GLOBAL_CONTEXT, {
        projectId: fixture.projectId,
        proposalId: nonExistentProposalId,
        currentUserEmail: CURRENT_USER_EMAIL,
      }),
    ).rejects.toThrow(BadRequestError);
  });

  it('should prevent non-members from viewing proposals', async () => {
    const {configId} = await fixture.engine.useCases.createConfig(GLOBAL_CONTEXT, {
      overrides: [],
      name: 'get_proposal_any_user',
      value: {enabled: false},
      schema: null,
      description: 'Original description',
      currentUserEmail: CURRENT_USER_EMAIL,
      editorEmails: [],
      maintainerEmails: [CURRENT_USER_EMAIL],
      projectId: fixture.projectId,
    });

    const {configProposalId} = await fixture.engine.useCases.createConfigProposal(GLOBAL_CONTEXT, {
      baseVersion: 1,
      configId,
      proposedDescription: {newDescription: 'New description'},
      currentUserEmail: OTHER_USER_EMAIL,
    });

    // THIRD_USER (not a project or org member) should NOT be able to view the proposal
    await expect(
      fixture.engine.useCases.getConfigProposal(GLOBAL_CONTEXT, {
        projectId: fixture.projectId,
        proposalId: configProposalId,
        currentUserEmail: THIRD_USER_EMAIL,
      }),
    ).rejects.toThrow('User does not have permission to view this project');
  });

  it('should return correct base config version', async () => {
    const {configId} = await fixture.engine.useCases.createConfig(GLOBAL_CONTEXT, {
      overrides: [],
      name: 'get_proposal_version',
      value: {enabled: false},
      schema: null,
      description: 'Original description',
      currentUserEmail: CURRENT_USER_EMAIL,
      editorEmails: [],
      maintainerEmails: [CURRENT_USER_EMAIL, OTHER_USER_EMAIL],
      projectId: fixture.projectId,
    });

    // Create and approve first proposal (version becomes 2)
    const {configProposalId: firstProposalId} = await fixture.engine.useCases.createConfigProposal(
      GLOBAL_CONTEXT,
      {
        baseVersion: 1,
        configId,
        proposedDescription: {newDescription: 'Version 2 description'},
        currentUserEmail: OTHER_USER_EMAIL,
      },
    );

    await fixture.engine.useCases.approveConfigProposal(GLOBAL_CONTEXT, {
      proposalId: firstProposalId,
      currentUserEmail: CURRENT_USER_EMAIL,
    });

    // Create second proposal (should have baseConfigVersion = 2)
    const {configProposalId: secondProposalId} = await fixture.engine.useCases.createConfigProposal(
      GLOBAL_CONTEXT,
      {
        baseVersion: 2,
        configId,
        proposedDescription: {newDescription: 'Version 3 description'},
        currentUserEmail: OTHER_USER_EMAIL,
      },
    );

    const result = await fixture.engine.useCases.getConfigProposal(GLOBAL_CONTEXT, {
      projectId: fixture.projectId,
      proposalId: secondProposalId,
      currentUserEmail: CURRENT_USER_EMAIL,
    });

    expect(result.proposal.baseConfigVersion).toBe(2);
  });

  it('should handle proposal with null proposerId', async () => {
    const {configId} = await fixture.engine.useCases.createConfig(GLOBAL_CONTEXT, {
      overrides: [],
      name: 'get_proposal_null_proposer',
      value: {enabled: false},
      schema: null,
      description: 'Original description',
      currentUserEmail: CURRENT_USER_EMAIL,
      editorEmails: [],
      maintainerEmails: [CURRENT_USER_EMAIL, OTHER_USER_EMAIL],
      projectId: fixture.projectId,
    });

    const {configProposalId} = await fixture.engine.useCases.createConfigProposal(GLOBAL_CONTEXT, {
      baseVersion: 1,
      configId,
      proposedDescription: {newDescription: 'New description'},
      currentUserEmail: OTHER_USER_EMAIL,
    });

    // Manually set proposerId to null (simulating deleted user)
    const connection = await fixture.engine.testing.pool.connect();
    try {
      await connection.query('UPDATE config_proposals SET proposer_id = NULL WHERE id = $1', [
        configProposalId,
      ]);
    } finally {
      connection.release();
    }

    const result = await fixture.engine.useCases.getConfigProposal(GLOBAL_CONTEXT, {
      projectId: fixture.projectId,
      proposalId: configProposalId,
      currentUserEmail: CURRENT_USER_EMAIL,
    });

    expect(result.proposal.proposerId).toBeNull();
    expect(result.proposal.proposerEmail).toBeNull();
  });

  it('should return base members from original snapshot', async () => {
    // Create a config with initial members
    const {configId} = await fixture.engine.useCases.createConfig(GLOBAL_CONTEXT, {
      overrides: [],
      name: 'base_members_test',
      value: {count: 1},
      schema: null,
      description: 'Test',
      currentUserEmail: CURRENT_USER_EMAIL,
      editorEmails: [OTHER_USER_EMAIL],
      maintainerEmails: [CURRENT_USER_EMAIL],
      projectId: fixture.projectId,
    });

    // Create a proposal based on version 1
    const {configProposalId} = await fixture.engine.useCases.createConfigProposal(GLOBAL_CONTEXT, {
      baseVersion: 1,
      configId,
      proposedDescription: {newDescription: 'New description'},
      currentUserEmail: OTHER_USER_EMAIL,
    });

    // Now modify the config's members (this will create version 2)
    await fixture.engine.useCases.patchConfig(GLOBAL_CONTEXT, {
      configId,
      members: {
        newMembers: [
          {email: CURRENT_USER_EMAIL, role: 'maintainer'},
          {email: THIRD_USER_EMAIL, role: 'editor'}, // THIRD_USER instead of OTHER_USER
        ],
      },
      currentUserEmail: CURRENT_USER_EMAIL,
      prevVersion: 1,
    });

    // Get the proposal - it should show base members from the original snapshot
    const result = await fixture.engine.useCases.getConfigProposal(GLOBAL_CONTEXT, {
      projectId: fixture.projectId,
      proposalId: configProposalId,
      currentUserEmail: CURRENT_USER_EMAIL,
    });

    // Base members should be from the original snapshot
    expect(result.proposal.baseMaintainerEmails).toEqual([CURRENT_USER_EMAIL]);
    expect(result.proposal.baseEditorEmails).toEqual([OTHER_USER_EMAIL]);
  });

  it('should handle member changes in proposal diff correctly', async () => {
    // Create config with initial members
    const {configId} = await fixture.engine.useCases.createConfig(GLOBAL_CONTEXT, {
      overrides: [],
      name: 'member_diff_test',
      value: {x: 1},
      schema: null,
      description: 'Test',
      currentUserEmail: CURRENT_USER_EMAIL,
      editorEmails: [OTHER_USER_EMAIL],
      maintainerEmails: [CURRENT_USER_EMAIL],
      projectId: fixture.projectId,
    });

    // Create a proposal to change members
    const {configProposalId} = await fixture.engine.useCases.createConfigProposal(GLOBAL_CONTEXT, {
      baseVersion: 1,
      configId,
      proposedMembers: {
        newMembers: [
          {email: CURRENT_USER_EMAIL, role: 'maintainer'},
          {email: THIRD_USER_EMAIL, role: 'editor'}, // Replace OTHER_USER with THIRD_USER
        ],
      },
      currentUserEmail: OTHER_USER_EMAIL,
    });

    const result = await fixture.engine.useCases.getConfigProposal(GLOBAL_CONTEXT, {
      projectId: fixture.projectId,
      proposalId: configProposalId,
      currentUserEmail: CURRENT_USER_EMAIL,
    });

    // Verify base members match the original config
    expect(result.proposal.baseMaintainerEmails).toEqual([CURRENT_USER_EMAIL]);
    expect(result.proposal.baseEditorEmails).toEqual([OTHER_USER_EMAIL]);

    // Verify the proposed members
    expect(result.proposal.proposedMembers?.newMembers).toEqual([
      {email: CURRENT_USER_EMAIL, role: 'maintainer'},
      {email: THIRD_USER_EMAIL, role: 'editor'},
    ]);
  });

  it('should return empty proposalsRejectedByThisApproval for pending proposal', async () => {
    const {configId} = await fixture.engine.useCases.createConfig(GLOBAL_CONTEXT, {
      overrides: [],
      name: 'pending_rejected_list',
      value: {enabled: false},
      schema: null,
      description: 'Original description',
      currentUserEmail: CURRENT_USER_EMAIL,
      editorEmails: [],
      maintainerEmails: [CURRENT_USER_EMAIL, OTHER_USER_EMAIL],
      projectId: fixture.projectId,
    });

    const {configProposalId} = await fixture.engine.useCases.createConfigProposal(GLOBAL_CONTEXT, {
      baseVersion: 1,
      configId,
      proposedDescription: {newDescription: 'New description'},
      currentUserEmail: OTHER_USER_EMAIL,
    });

    const result = await fixture.engine.useCases.getConfigProposal(GLOBAL_CONTEXT, {
      projectId: fixture.projectId,
      proposalId: configProposalId,
      currentUserEmail: CURRENT_USER_EMAIL,
    });

    expect(result.proposalsRejectedByThisApproval).toEqual([]);
  });

  it('should return empty proposalsRejectedByThisApproval for rejected proposal', async () => {
    const {configId} = await fixture.engine.useCases.createConfig(GLOBAL_CONTEXT, {
      overrides: [],
      name: 'rejected_rejected_list',
      value: {enabled: false},
      schema: null,
      description: 'Original description',
      currentUserEmail: CURRENT_USER_EMAIL,
      editorEmails: [],
      maintainerEmails: [CURRENT_USER_EMAIL, OTHER_USER_EMAIL],
      projectId: fixture.projectId,
    });

    const {configProposalId} = await fixture.engine.useCases.createConfigProposal(GLOBAL_CONTEXT, {
      baseVersion: 1,
      configId,
      proposedDescription: {newDescription: 'New description'},
      currentUserEmail: OTHER_USER_EMAIL,
    });

    await fixture.engine.useCases.rejectConfigProposal(GLOBAL_CONTEXT, {
      proposalId: configProposalId,
      currentUserEmail: CURRENT_USER_EMAIL,
    });

    const result = await fixture.engine.useCases.getConfigProposal(GLOBAL_CONTEXT, {
      projectId: fixture.projectId,
      proposalId: configProposalId,
      currentUserEmail: CURRENT_USER_EMAIL,
    });

    expect(result.proposalsRejectedByThisApproval).toEqual([]);
  });

  it('should return proposalsRejectedByThisApproval when proposal is approved', async () => {
    const {configId} = await fixture.engine.useCases.createConfig(GLOBAL_CONTEXT, {
      overrides: [],
      name: 'approved_with_rejected',
      value: {enabled: false},
      schema: null,
      description: 'Original description',
      currentUserEmail: CURRENT_USER_EMAIL,
      editorEmails: [],
      maintainerEmails: [CURRENT_USER_EMAIL, OTHER_USER_EMAIL, THIRD_USER_EMAIL],
      projectId: fixture.projectId,
    });

    // Create three proposals
    const {configProposalId: proposal1Id} = await fixture.engine.useCases.createConfigProposal(
      GLOBAL_CONTEXT,
      {
        baseVersion: 1,
        configId,
        proposedDescription: {newDescription: 'First description'},
        currentUserEmail: OTHER_USER_EMAIL,
      },
    );

    const {configProposalId: proposal2Id} = await fixture.engine.useCases.createConfigProposal(
      GLOBAL_CONTEXT,
      {
        baseVersion: 1,
        configId,
        proposedDescription: {newDescription: 'Second description'},
        currentUserEmail: THIRD_USER_EMAIL,
      },
    );

    const {configProposalId: proposal3Id} = await fixture.engine.useCases.createConfigProposal(
      GLOBAL_CONTEXT,
      {
        baseVersion: 1,
        configId,
        proposedDescription: {newDescription: 'Third description'},
        currentUserEmail: CURRENT_USER_EMAIL,
      },
    );

    // Approve proposal 2 (which should reject proposals 1 and 3)
    await fixture.engine.useCases.approveConfigProposal(GLOBAL_CONTEXT, {
      proposalId: proposal2Id,
      currentUserEmail: CURRENT_USER_EMAIL,
    });

    // Get the approved proposal
    const result = await fixture.engine.useCases.getConfigProposal(GLOBAL_CONTEXT, {
      projectId: fixture.projectId,
      proposalId: proposal2Id,
      currentUserEmail: CURRENT_USER_EMAIL,
    });

    // Should include the two rejected proposals
    expect(result.proposalsRejectedByThisApproval).toHaveLength(2);
    expect(result.proposalsRejectedByThisApproval).toEqual(
      expect.arrayContaining([
        {id: proposal1Id, proposerEmail: OTHER_USER_EMAIL},
        {id: proposal3Id, proposerEmail: CURRENT_USER_EMAIL},
      ]),
    );
  });

  it('should return proposalsRejectedByThisApproval with null proposerEmail when proposer was deleted', async () => {
    const {configId} = await fixture.engine.useCases.createConfig(GLOBAL_CONTEXT, {
      overrides: [],
      name: 'approved_with_null_proposer',
      value: {enabled: false},
      schema: null,
      description: 'Original description',
      currentUserEmail: CURRENT_USER_EMAIL,
      editorEmails: [],
      maintainerEmails: [CURRENT_USER_EMAIL, OTHER_USER_EMAIL, THIRD_USER_EMAIL],
      projectId: fixture.projectId,
    });

    // Create two proposals
    const {configProposalId: proposal1Id} = await fixture.engine.useCases.createConfigProposal(
      GLOBAL_CONTEXT,
      {
        baseVersion: 1,
        configId,
        proposedDescription: {newDescription: 'First description'},
        currentUserEmail: OTHER_USER_EMAIL,
      },
    );

    const {configProposalId: proposal2Id} = await fixture.engine.useCases.createConfigProposal(
      GLOBAL_CONTEXT,
      {
        baseVersion: 1,
        configId,
        proposedDescription: {newDescription: 'Second description'},
        currentUserEmail: THIRD_USER_EMAIL,
      },
    );

    // Manually set proposal1's proposerId to null (simulating deleted user)
    const connection = await fixture.engine.testing.pool.connect();
    try {
      await connection.query('UPDATE config_proposals SET proposer_id = NULL WHERE id = $1', [
        proposal1Id,
      ]);
    } finally {
      connection.release();
    }

    // Approve proposal 2 (which should reject proposal 1)
    await fixture.engine.useCases.approveConfigProposal(GLOBAL_CONTEXT, {
      proposalId: proposal2Id,
      currentUserEmail: CURRENT_USER_EMAIL,
    });

    // Get the approved proposal
    const result = await fixture.engine.useCases.getConfigProposal(GLOBAL_CONTEXT, {
      projectId: fixture.projectId,
      proposalId: proposal2Id,
      currentUserEmail: CURRENT_USER_EMAIL,
    });

    // Should include the rejected proposal with null proposerEmail
    expect(result.proposalsRejectedByThisApproval).toHaveLength(1);
    expect(result.proposalsRejectedByThisApproval[0]).toEqual({
      id: proposal1Id,
      proposerEmail: null,
    });
  });

  it('should return empty proposalsRejectedByThisApproval when no other proposals were rejected', async () => {
    const {configId} = await fixture.engine.useCases.createConfig(GLOBAL_CONTEXT, {
      overrides: [],
      name: 'approved_no_others',
      value: {enabled: false},
      schema: null,
      description: 'Original description',
      currentUserEmail: CURRENT_USER_EMAIL,
      editorEmails: [],
      maintainerEmails: [CURRENT_USER_EMAIL, OTHER_USER_EMAIL],
      projectId: fixture.projectId,
    });

    // Create only one proposal
    const {configProposalId} = await fixture.engine.useCases.createConfigProposal(GLOBAL_CONTEXT, {
      baseVersion: 1,
      configId,
      proposedDescription: {newDescription: 'New description'},
      currentUserEmail: OTHER_USER_EMAIL,
    });

    // Approve it
    await fixture.engine.useCases.approveConfigProposal(GLOBAL_CONTEXT, {
      proposalId: configProposalId,
      currentUserEmail: CURRENT_USER_EMAIL,
    });

    // Get the approved proposal
    const result = await fixture.engine.useCases.getConfigProposal(GLOBAL_CONTEXT, {
      projectId: fixture.projectId,
      proposalId: configProposalId,
      currentUserEmail: CURRENT_USER_EMAIL,
    });

    // Should have no rejected proposals
    expect(result.proposalsRejectedByThisApproval).toEqual([]);
  });

  it('should get a proposal with variant changes', async () => {
    const {configId, configVariantIds} = await fixture.engine.useCases.createConfig(
      GLOBAL_CONTEXT,
      {
        overrides: [],
        name: 'get_proposal_with_variants',
        value: {enabled: true},
        schema: {type: 'object', properties: {enabled: {type: 'boolean'}}},
        description: 'Variant proposal test',
        currentUserEmail: CURRENT_USER_EMAIL,
        editorEmails: [],
        maintainerEmails: [CURRENT_USER_EMAIL, OTHER_USER_EMAIL],
        projectId: fixture.projectId,
      },
    );

    // Get the production variant
    const prodVariantId = configVariantIds.find(
      v => v.environmentId === fixture.productionEnvironmentId,
    )?.variantId;

    const {configProposalId} = await fixture.engine.useCases.createConfigProposal(GLOBAL_CONTEXT, {
      baseVersion: 1,
      configId,
      proposedVariants: [
        {
          configVariantId: prodVariantId!,
          baseVariantVersion: 1,
          proposedValue: {newValue: {enabled: false}},
        },
      ],
      currentUserEmail: OTHER_USER_EMAIL,
    });

    const result = await fixture.engine.useCases.getConfigProposal(GLOBAL_CONTEXT, {
      projectId: fixture.projectId,
      proposalId: configProposalId,
      currentUserEmail: CURRENT_USER_EMAIL,
    });

    expect(result.proposal.proposedVariants).toHaveLength(1);
    expect(result.proposal.proposedVariants[0]).toMatchObject({
      configVariantId: prodVariantId!,
      environmentName: 'Production',
      proposedValue: {enabled: false},
      currentValue: {enabled: true},
    });
  });

  it('should indicate maintainers as approvers for schema changes in variants', async () => {
    const {configId, configVariantIds} = await fixture.engine.useCases.createConfig(
      GLOBAL_CONTEXT,
      {
        overrides: [],
        name: 'get_proposal_schema_change',
        value: {enabled: true},
        schema: {type: 'object', properties: {enabled: {type: 'boolean'}}},
        description: 'Schema change test',
        currentUserEmail: CURRENT_USER_EMAIL,
        editorEmails: [OTHER_USER_EMAIL],
        maintainerEmails: [CURRENT_USER_EMAIL],
        projectId: fixture.projectId,
      },
    );

    // Get the production variant
    const prodVariantId = configVariantIds.find(
      v => v.environmentId === fixture.productionEnvironmentId,
    )?.variantId;

    const {configProposalId} = await fixture.engine.useCases.createConfigProposal(GLOBAL_CONTEXT, {
      baseVersion: 1,
      configId,
      proposedVariants: [
        {
          configVariantId: prodVariantId!,
          baseVariantVersion: 1,
          proposedSchema: {
            newSchema: {
              type: 'object',
              properties: {enabled: {type: 'boolean'}, count: {type: 'number'}},
            },
          },
        },
      ],
      currentUserEmail: OTHER_USER_EMAIL,
    });

    const result = await fixture.engine.useCases.getConfigProposal(GLOBAL_CONTEXT, {
      projectId: fixture.projectId,
      proposalId: configProposalId,
      currentUserEmail: CURRENT_USER_EMAIL,
    });

    expect(result.proposal.approverRole).toBe('maintainers');
    expect(result.proposal.approverReason).toBe('Schema changes require maintainer approval.');
  });
});
