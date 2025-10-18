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

  it('should get a pending proposal with value change', async () => {
    const {configId} = await fixture.engine.useCases.createConfig(GLOBAL_CONTEXT, {
      name: 'get_proposal_value',
      value: {enabled: false},
      schema: null,
      description: 'Original description',
      currentUserEmail: CURRENT_USER_EMAIL,
      editorEmails: [CURRENT_USER_EMAIL, OTHER_USER_EMAIL],
      ownerEmails: [],
      projectId: fixture.projectId,
    });

    const {configProposalId} = await fixture.engine.useCases.createConfigProposal(GLOBAL_CONTEXT, {
      configId,
      proposedValue: {newValue: {enabled: true}},
      currentUserEmail: OTHER_USER_EMAIL,
    });

    const result = await fixture.engine.useCases.getConfigProposal(GLOBAL_CONTEXT, {
      proposalId: configProposalId,
      currentUserEmail: CURRENT_USER_EMAIL,
    });

    expect(result.proposal).toMatchObject({
      id: configProposalId,
      configId,
      configName: 'get_proposal_value',
      proposerId: OTHER_USER_ID,
      proposerEmail: OTHER_USER_EMAIL,
      status: 'pending',
      proposedValue: {newValue: {enabled: true}},
      proposedDescription: null,
      proposedSchema: null,
      rejectedAt: null,
      approvedAt: null,
      reviewerId: null,
      reviewerEmail: null,
    });
    expect(result.proposal.createdAt).toBeDefined();
    expect(result.proposal.baseConfigVersion).toBe(1);
  });

  it('should get a pending proposal with description change', async () => {
    const {configId} = await fixture.engine.useCases.createConfig(GLOBAL_CONTEXT, {
      name: 'get_proposal_description',
      value: {enabled: false},
      schema: null,
      description: 'Original description',
      currentUserEmail: CURRENT_USER_EMAIL,
      editorEmails: [CURRENT_USER_EMAIL, OTHER_USER_EMAIL],
      ownerEmails: [],
      projectId: fixture.projectId,
    });

    const {configProposalId} = await fixture.engine.useCases.createConfigProposal(GLOBAL_CONTEXT, {
      configId,
      proposedDescription: {newDescription: 'Updated description'},
      currentUserEmail: OTHER_USER_EMAIL,
    });

    const result = await fixture.engine.useCases.getConfigProposal(GLOBAL_CONTEXT, {
      proposalId: configProposalId,
      currentUserEmail: CURRENT_USER_EMAIL,
    });

    expect(result.proposal).toMatchObject({
      id: configProposalId,
      configId,
      configName: 'get_proposal_description',
      status: 'pending',
      proposedValue: null,
      proposedDescription: 'Updated description',
      proposedSchema: null,
    });
  });

  it('should get a pending proposal with schema change', async () => {
    const {configId} = await fixture.engine.useCases.createConfig(GLOBAL_CONTEXT, {
      name: 'get_proposal_schema',
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
      configId,
      proposedSchema: {newSchema},
      currentUserEmail: OTHER_USER_EMAIL,
    });

    const result = await fixture.engine.useCases.getConfigProposal(GLOBAL_CONTEXT, {
      proposalId: configProposalId,
      currentUserEmail: CURRENT_USER_EMAIL,
    });

    expect(result.proposal).toMatchObject({
      id: configProposalId,
      configId,
      configName: 'get_proposal_schema',
      status: 'pending',
      proposedValue: null,
      proposedDescription: null,
      proposedSchema: {newSchema},
    });
  });

  it('should get a pending proposal with multiple changes', async () => {
    const {configId} = await fixture.engine.useCases.createConfig(GLOBAL_CONTEXT, {
      name: 'get_proposal_multiple',
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
      configId,
      proposedValue: {newValue: {enabled: true}},
      proposedDescription: {newDescription: 'Updated description'},
      proposedSchema: {newSchema},
      currentUserEmail: OTHER_USER_EMAIL,
    });

    const result = await fixture.engine.useCases.getConfigProposal(GLOBAL_CONTEXT, {
      proposalId: configProposalId,
      currentUserEmail: CURRENT_USER_EMAIL,
    });

    expect(result.proposal).toMatchObject({
      id: configProposalId,
      configId,
      configName: 'get_proposal_multiple',
      status: 'pending',
      proposedValue: {newValue: {enabled: true}},
      proposedDescription: 'Updated description',
      proposedSchema: {newSchema},
    });
  });

  it('should get an approved proposal', async () => {
    const {configId} = await fixture.engine.useCases.createConfig(GLOBAL_CONTEXT, {
      name: 'get_proposal_approved',
      value: {enabled: false},
      schema: null,
      description: 'Original description',
      currentUserEmail: CURRENT_USER_EMAIL,
      editorEmails: [CURRENT_USER_EMAIL, OTHER_USER_EMAIL],
      ownerEmails: [],
      projectId: fixture.projectId,
    });

    const {configProposalId} = await fixture.engine.useCases.createConfigProposal(GLOBAL_CONTEXT, {
      configId,
      proposedValue: {newValue: {enabled: true}},
      currentUserEmail: OTHER_USER_EMAIL,
    });

    // Approve the proposal
    await fixture.engine.useCases.approveConfigProposal(GLOBAL_CONTEXT, {
      proposalId: configProposalId,
      currentUserEmail: CURRENT_USER_EMAIL,
    });

    const result = await fixture.engine.useCases.getConfigProposal(GLOBAL_CONTEXT, {
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
      name: 'get_proposal_rejected',
      value: {enabled: false},
      schema: null,
      description: 'Original description',
      currentUserEmail: CURRENT_USER_EMAIL,
      editorEmails: [CURRENT_USER_EMAIL, OTHER_USER_EMAIL],
      ownerEmails: [],
      projectId: fixture.projectId,
    });

    const {configProposalId} = await fixture.engine.useCases.createConfigProposal(GLOBAL_CONTEXT, {
      configId,
      proposedValue: {newValue: {enabled: true}},
      currentUserEmail: OTHER_USER_EMAIL,
    });

    // Reject the proposal
    await fixture.engine.useCases.rejectConfigProposal(GLOBAL_CONTEXT, {
      proposalId: configProposalId,
      currentUserEmail: CURRENT_USER_EMAIL,
    });

    const result = await fixture.engine.useCases.getConfigProposal(GLOBAL_CONTEXT, {
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
      name: 'get_proposal_rejected_in_favor',
      value: {enabled: false},
      schema: null,
      description: 'Original description',
      currentUserEmail: CURRENT_USER_EMAIL,
      editorEmails: [CURRENT_USER_EMAIL, OTHER_USER_EMAIL],
      ownerEmails: [],
      projectId: fixture.projectId,
    });

    // Create two proposals
    const {configProposalId: proposal1Id} = await fixture.engine.useCases.createConfigProposal(
      GLOBAL_CONTEXT,
      {
        configId,
        proposedValue: {newValue: {enabled: true}},
        currentUserEmail: OTHER_USER_EMAIL,
      },
    );

    const {configProposalId: proposal2Id} = await fixture.engine.useCases.createConfigProposal(
      GLOBAL_CONTEXT,
      {
        configId,
        proposedValue: {newValue: {enabled: false, count: 5}},
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
      proposalId: proposal1Id,
      currentUserEmail: CURRENT_USER_EMAIL,
    });

    expect(result.proposal.status).toBe('rejected');
    expect(result.proposal.rejectedAt).toBeDefined();
    expect(result.proposal.rejectedInFavorOfProposalId).toBe(proposal2Id);
  });

  it('should include proposer email when proposer exists', async () => {
    const {configId} = await fixture.engine.useCases.createConfig(GLOBAL_CONTEXT, {
      name: 'get_proposal_proposer',
      value: {enabled: false},
      schema: null,
      description: 'Original description',
      currentUserEmail: CURRENT_USER_EMAIL,
      editorEmails: [CURRENT_USER_EMAIL, OTHER_USER_EMAIL],
      ownerEmails: [],
      projectId: fixture.projectId,
    });

    const {configProposalId} = await fixture.engine.useCases.createConfigProposal(GLOBAL_CONTEXT, {
      configId,
      proposedValue: {newValue: {enabled: true}},
      currentUserEmail: OTHER_USER_EMAIL,
    });

    const result = await fixture.engine.useCases.getConfigProposal(GLOBAL_CONTEXT, {
      proposalId: configProposalId,
      currentUserEmail: CURRENT_USER_EMAIL,
    });

    expect(result.proposal.proposerId).toBe(OTHER_USER_ID);
    expect(result.proposal.proposerEmail).toBe(OTHER_USER_EMAIL);
  });

  it('should include reviewer email when proposal is reviewed', async () => {
    const {configId} = await fixture.engine.useCases.createConfig(GLOBAL_CONTEXT, {
      name: 'get_proposal_reviewer',
      value: {enabled: false},
      schema: null,
      description: 'Original description',
      currentUserEmail: CURRENT_USER_EMAIL,
      editorEmails: [CURRENT_USER_EMAIL, OTHER_USER_EMAIL],
      ownerEmails: [],
      projectId: fixture.projectId,
    });

    const {configProposalId} = await fixture.engine.useCases.createConfigProposal(GLOBAL_CONTEXT, {
      configId,
      proposedValue: {newValue: {enabled: true}},
      currentUserEmail: OTHER_USER_EMAIL,
    });

    await fixture.engine.useCases.approveConfigProposal(GLOBAL_CONTEXT, {
      proposalId: configProposalId,
      currentUserEmail: CURRENT_USER_EMAIL,
    });

    const result = await fixture.engine.useCases.getConfigProposal(GLOBAL_CONTEXT, {
      proposalId: configProposalId,
      currentUserEmail: CURRENT_USER_EMAIL,
    });

    expect(result.proposal.reviewerId).toBe(1); // CURRENT_USER_ID
    expect(result.proposal.reviewerEmail).toBe(CURRENT_USER_EMAIL);
  });

  it('should include config name in response', async () => {
    const {configId} = await fixture.engine.useCases.createConfig(GLOBAL_CONTEXT, {
      name: 'my_special_config',
      value: {enabled: false},
      schema: null,
      description: 'Original description',
      currentUserEmail: CURRENT_USER_EMAIL,
      editorEmails: [CURRENT_USER_EMAIL, OTHER_USER_EMAIL],
      ownerEmails: [],
      projectId: fixture.projectId,
    });

    const {configProposalId} = await fixture.engine.useCases.createConfigProposal(GLOBAL_CONTEXT, {
      configId,
      proposedValue: {newValue: {enabled: true}},
      currentUserEmail: OTHER_USER_EMAIL,
    });

    const result = await fixture.engine.useCases.getConfigProposal(GLOBAL_CONTEXT, {
      proposalId: configProposalId,
      currentUserEmail: CURRENT_USER_EMAIL,
    });

    expect(result.proposal.configName).toBe('my_special_config');
  });

  it('should throw BadRequestError for non-existent proposal', async () => {
    const nonExistentProposalId = createUuidV4();

    await expect(
      fixture.engine.useCases.getConfigProposal(GLOBAL_CONTEXT, {
        proposalId: nonExistentProposalId,
        currentUserEmail: CURRENT_USER_EMAIL,
      }),
    ).rejects.toThrow(BadRequestError);
  });

  it('should allow any user to get a proposal', async () => {
    const {configId} = await fixture.engine.useCases.createConfig(GLOBAL_CONTEXT, {
      name: 'get_proposal_any_user',
      value: {enabled: false},
      schema: null,
      description: 'Original description',
      currentUserEmail: CURRENT_USER_EMAIL,
      editorEmails: [CURRENT_USER_EMAIL],
      ownerEmails: [],
      projectId: fixture.projectId,
    });

    const {configProposalId} = await fixture.engine.useCases.createConfigProposal(GLOBAL_CONTEXT, {
      configId,
      proposedValue: {newValue: {enabled: true}},
      currentUserEmail: OTHER_USER_EMAIL,
    });

    // THIRD_USER (not a member) can get the proposal
    const result = await fixture.engine.useCases.getConfigProposal(GLOBAL_CONTEXT, {
      proposalId: configProposalId,
      currentUserEmail: THIRD_USER_EMAIL,
    });

    expect(result.proposal.id).toBe(configProposalId);
  });

  it('should return correct base config version', async () => {
    const {configId} = await fixture.engine.useCases.createConfig(GLOBAL_CONTEXT, {
      name: 'get_proposal_version',
      value: {enabled: false},
      schema: null,
      description: 'Original description',
      currentUserEmail: CURRENT_USER_EMAIL,
      editorEmails: [CURRENT_USER_EMAIL, OTHER_USER_EMAIL],
      ownerEmails: [],
      projectId: fixture.projectId,
    });

    // Create and approve first proposal (version becomes 2)
    const {configProposalId: firstProposalId} = await fixture.engine.useCases.createConfigProposal(
      GLOBAL_CONTEXT,
      {
        configId,
        proposedValue: {newValue: {enabled: true}},
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
        configId,
        proposedValue: {newValue: {enabled: false}},
        currentUserEmail: OTHER_USER_EMAIL,
      },
    );

    const result = await fixture.engine.useCases.getConfigProposal(GLOBAL_CONTEXT, {
      proposalId: secondProposalId,
      currentUserEmail: CURRENT_USER_EMAIL,
    });

    expect(result.proposal.baseConfigVersion).toBe(2);
  });

  it('should handle proposal with null proposerId', async () => {
    const {configId} = await fixture.engine.useCases.createConfig(GLOBAL_CONTEXT, {
      name: 'get_proposal_null_proposer',
      value: {enabled: false},
      schema: null,
      description: 'Original description',
      currentUserEmail: CURRENT_USER_EMAIL,
      editorEmails: [CURRENT_USER_EMAIL, OTHER_USER_EMAIL],
      ownerEmails: [],
      projectId: fixture.projectId,
    });

    const {configProposalId} = await fixture.engine.useCases.createConfigProposal(GLOBAL_CONTEXT, {
      configId,
      proposedValue: {newValue: {enabled: true}},
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
      proposalId: configProposalId,
      currentUserEmail: CURRENT_USER_EMAIL,
    });

    expect(result.proposal.proposerId).toBeNull();
    expect(result.proposal.proposerEmail).toBeNull();
  });
});
