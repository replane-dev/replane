import {GLOBAL_CONTEXT} from '@/engine/core/context';
import {BadRequestError} from '@/engine/core/errors';
import {normalizeEmail} from '@/engine/core/utils';
import {createUuidV4} from '@/engine/core/uuid';
import {describe, expect, it} from 'vitest';
import {TEST_USER_ID, useAppFixture} from './fixtures/trpc-fixture';

const CURRENT_USER_EMAIL = normalizeEmail('test@example.com');

describe('createConfigProposal', () => {
  const fixture = useAppFixture({authEmail: CURRENT_USER_EMAIL});

  it('should create a proposal with new value', async () => {
    // Create a config first
    const {configId} = await fixture.engine.useCases.createConfig(GLOBAL_CONTEXT, {
      name: 'test_config',
      value: {flag: true},
      schema: {type: 'object', properties: {flag: {type: 'boolean'}}},
      description: 'Original description',
      currentUserEmail: CURRENT_USER_EMAIL,
      editorEmails: [CURRENT_USER_EMAIL],
      ownerEmails: [],
      projectId: fixture.projectId,
    });

    // Create a proposal with new value
    const {configProposalId} = await fixture.engine.useCases.createConfigProposal(GLOBAL_CONTEXT, {
      configId,
      proposedValue: {newValue: {flag: false}},
      currentUserEmail: CURRENT_USER_EMAIL,
    });

    expect(configProposalId).toBeDefined();
    expect(typeof configProposalId).toBe('string');

    // Verify the proposal was created
    const proposal = await fixture.engine.testing.configProposals.getById(configProposalId);
    expect(proposal).toEqual({
      id: configProposalId,
      configId,
      proposerId: TEST_USER_ID,
      createdAt: fixture.now,
      rejectedAt: null,
      approvedAt: null,
      reviewerId: null,
      rejectedInFavorOfProposalId: null,
      baseConfigVersion: 1,
      proposedDelete: false,
      proposedValue: {newValue: {flag: false}},
      proposedDescription: null,
      proposedSchema: null,
    });
  });

  it('should create a proposal with new schema', async () => {
    const {configId} = await fixture.engine.useCases.createConfig(GLOBAL_CONTEXT, {
      name: 'schema_test_config',
      value: {count: 5},
      schema: {type: 'object', properties: {count: {type: 'number'}}},
      description: 'Schema test',
      currentUserEmail: CURRENT_USER_EMAIL,
      editorEmails: [CURRENT_USER_EMAIL],
      ownerEmails: [],
      projectId: fixture.projectId,
    });

    const newSchema = {
      type: 'object',
      properties: {count: {type: 'number', minimum: 0, maximum: 100}},
    };

    const {configProposalId} = await fixture.engine.useCases.createConfigProposal(GLOBAL_CONTEXT, {
      configId,
      proposedSchema: {newSchema},
      currentUserEmail: CURRENT_USER_EMAIL,
    });

    const proposal = await fixture.engine.testing.configProposals.getById(configProposalId);
    expect(proposal?.proposedSchema).toEqual({newSchema});
    expect(proposal?.proposedValue).toBeNull();
  });

  it('should create a proposal with new description only', async () => {
    const {configId} = await fixture.engine.useCases.createConfig(GLOBAL_CONTEXT, {
      name: 'desc_test_config',
      value: 'test',
      schema: null,
      description: 'Old description',
      currentUserEmail: CURRENT_USER_EMAIL,
      editorEmails: [CURRENT_USER_EMAIL],
      ownerEmails: [],
      projectId: fixture.projectId,
    });

    const {configProposalId} = await fixture.engine.useCases.createConfigProposal(GLOBAL_CONTEXT, {
      configId,
      proposedDescription: {newDescription: 'New description'},
      currentUserEmail: CURRENT_USER_EMAIL,
    });

    const proposal = await fixture.engine.testing.configProposals.getById(configProposalId);
    expect(proposal?.proposedDescription).toBe('New description');
    expect(proposal?.proposedValue).toBeNull();
    expect(proposal?.proposedSchema).toBeNull();
  });

  it('should create a proposal with value, schema, and description', async () => {
    const {configId} = await fixture.engine.useCases.createConfig(GLOBAL_CONTEXT, {
      name: 'all_fields_config',
      value: {x: 1},
      schema: {type: 'object', properties: {x: {type: 'number'}}},
      description: 'Original',
      currentUserEmail: CURRENT_USER_EMAIL,
      editorEmails: [CURRENT_USER_EMAIL],
      ownerEmails: [],
      projectId: fixture.projectId,
    });

    const {configProposalId} = await fixture.engine.useCases.createConfigProposal(GLOBAL_CONTEXT, {
      configId,
      proposedValue: {newValue: {x: 2, y: 3}},
      proposedSchema: {
        newSchema: {type: 'object', properties: {x: {type: 'number'}, y: {type: 'number'}}},
      },
      proposedDescription: {newDescription: 'Updated config'},
      currentUserEmail: CURRENT_USER_EMAIL,
    });

    const proposal = await fixture.engine.testing.configProposals.getById(configProposalId);
    expect(proposal?.proposedValue).toEqual({newValue: {x: 2, y: 3}});
    expect(proposal?.proposedSchema).toEqual({
      newSchema: {type: 'object', properties: {x: {type: 'number'}, y: {type: 'number'}}},
    });
    expect(proposal?.proposedDescription).toBe('Updated config');
  });

  it('should create a deletion proposal', async () => {
    const {configId} = await fixture.engine.useCases.createConfig(GLOBAL_CONTEXT, {
      name: 'deletion_proposal_config',
      value: {x: 1},
      schema: {type: 'object', properties: {x: {type: 'number'}}},
      description: 'To be deleted',
      currentUserEmail: CURRENT_USER_EMAIL,
      editorEmails: [CURRENT_USER_EMAIL],
      ownerEmails: [],
      projectId: fixture.projectId,
    });

    const {configProposalId} = await fixture.engine.useCases.createConfigProposal(GLOBAL_CONTEXT, {
      configId,
      proposedDelete: true,
      currentUserEmail: CURRENT_USER_EMAIL,
    });

    const proposal = await fixture.engine.testing.configProposals.getById(configProposalId);
    expect(proposal).toBeDefined();
    expect(proposal?.proposedDelete).toBe(true);
    expect(proposal?.proposedValue).toBeNull();
    expect(proposal?.proposedDescription).toBeNull();
    expect(proposal?.proposedSchema).toBeNull();
  });

  it('should validate new value against new schema when both are proposed', async () => {
    const {configId} = await fixture.engine.useCases.createConfig(GLOBAL_CONTEXT, {
      name: 'validation_test_1',
      value: {count: 5},
      schema: {type: 'object', properties: {count: {type: 'number'}}},
      description: 'Test',
      currentUserEmail: CURRENT_USER_EMAIL,
      editorEmails: [CURRENT_USER_EMAIL],
      ownerEmails: [],
      projectId: fixture.projectId,
    });

    // Propose incompatible value and schema
    await expect(
      fixture.engine.useCases.createConfigProposal(GLOBAL_CONTEXT, {
        configId,
        proposedValue: {newValue: {count: 'not a number'}},
        proposedSchema: {
          newSchema: {type: 'object', properties: {count: {type: 'number'}}},
        },
        currentUserEmail: CURRENT_USER_EMAIL,
      }),
    ).rejects.toBeInstanceOf(BadRequestError);
  });

  it('should validate new value against current schema when only value is proposed', async () => {
    const {configId} = await fixture.engine.useCases.createConfig(GLOBAL_CONTEXT, {
      name: 'validation_test_2',
      value: {flag: true},
      schema: {type: 'object', properties: {flag: {type: 'boolean'}}},
      description: 'Test',
      currentUserEmail: CURRENT_USER_EMAIL,
      editorEmails: [CURRENT_USER_EMAIL],
      ownerEmails: [],
      projectId: fixture.projectId,
    });

    // Propose value that doesn't match current schema
    await expect(
      fixture.engine.useCases.createConfigProposal(GLOBAL_CONTEXT, {
        configId,
        proposedValue: {newValue: {flag: 'not a boolean'}},
        currentUserEmail: CURRENT_USER_EMAIL,
      }),
    ).rejects.toBeInstanceOf(BadRequestError);
  });

  it('should validate current value against new schema when only schema is proposed', async () => {
    const {configId} = await fixture.engine.useCases.createConfig(GLOBAL_CONTEXT, {
      name: 'validation_test_3',
      value: {count: 150},
      schema: {type: 'object', properties: {count: {type: 'number'}}},
      description: 'Test',
      currentUserEmail: CURRENT_USER_EMAIL,
      editorEmails: [CURRENT_USER_EMAIL],
      ownerEmails: [],
      projectId: fixture.projectId,
    });

    // Propose schema that current value doesn't satisfy
    await expect(
      fixture.engine.useCases.createConfigProposal(GLOBAL_CONTEXT, {
        configId,
        proposedSchema: {
          newSchema: {
            type: 'object',
            properties: {count: {type: 'number', maximum: 100}},
          },
        },
        currentUserEmail: CURRENT_USER_EMAIL,
      }),
    ).rejects.toBeInstanceOf(BadRequestError);
  });

  it('should allow proposing schema removal (null)', async () => {
    const {configId} = await fixture.engine.useCases.createConfig(GLOBAL_CONTEXT, {
      name: 'schema_removal_config',
      value: {anything: 'goes'},
      schema: {type: 'object'},
      description: 'Test',
      currentUserEmail: CURRENT_USER_EMAIL,
      editorEmails: [CURRENT_USER_EMAIL],
      ownerEmails: [],
      projectId: fixture.projectId,
    });

    const {configProposalId} = await fixture.engine.useCases.createConfigProposal(GLOBAL_CONTEXT, {
      configId,
      proposedSchema: {newSchema: null},
      currentUserEmail: CURRENT_USER_EMAIL,
    });

    const proposal = await fixture.engine.testing.configProposals.getById(configProposalId);
    expect(proposal?.proposedSchema).toEqual({newSchema: null});
  });

  it('should not validate when schema is removed', async () => {
    const {configId} = await fixture.engine.useCases.createConfig(GLOBAL_CONTEXT, {
      name: 'no_validation_config',
      value: {count: 5},
      schema: {type: 'object', properties: {count: {type: 'number'}}},
      description: 'Test',
      currentUserEmail: CURRENT_USER_EMAIL,
      editorEmails: [CURRENT_USER_EMAIL],
      ownerEmails: [],
      projectId: fixture.projectId,
    });

    // Remove schema and propose invalid value - should be allowed
    const {configProposalId} = await fixture.engine.useCases.createConfigProposal(GLOBAL_CONTEXT, {
      configId,
      proposedValue: {newValue: 'this would fail with the old schema'},
      proposedSchema: {newSchema: null},
      currentUserEmail: CURRENT_USER_EMAIL,
    });

    const proposal = await fixture.engine.testing.configProposals.getById(configProposalId);
    expect(proposal).toBeDefined();
  });

  it('should throw BadRequestError when config does not exist', async () => {
    await expect(
      fixture.engine.useCases.createConfigProposal(GLOBAL_CONTEXT, {
        configId: createUuidV4(),
        proposedValue: {newValue: 'test'},
        currentUserEmail: CURRENT_USER_EMAIL,
      }),
    ).rejects.toBeInstanceOf(BadRequestError);
  });

  it('should throw BadRequestError when no fields are proposed', async () => {
    const {configId} = await fixture.engine.useCases.createConfig(GLOBAL_CONTEXT, {
      name: 'empty_proposal_config',
      value: 'test',
      schema: null,
      description: 'Test',
      currentUserEmail: CURRENT_USER_EMAIL,
      editorEmails: [CURRENT_USER_EMAIL],
      ownerEmails: [],
      projectId: fixture.projectId,
    });

    await expect(
      fixture.engine.useCases.createConfigProposal(GLOBAL_CONTEXT, {
        configId,
        currentUserEmail: CURRENT_USER_EMAIL,
      }),
    ).rejects.toThrow('At least one field must be proposed');
  });

  it('should allow proposal creation without edit permissions', async () => {
    const otherUserEmail = normalizeEmail('other@example.com');

    const {configId} = await fixture.engine.useCases.createConfig(GLOBAL_CONTEXT, {
      name: 'permission_test_config',
      value: 'test',
      schema: null,
      description: 'Test',
      currentUserEmail: CURRENT_USER_EMAIL,
      editorEmails: [],
      ownerEmails: [CURRENT_USER_EMAIL],
      projectId: fixture.projectId,
    });

    // Add the other user to the database
    const connection = await fixture.engine.testing.pool.connect();
    try {
      await connection.query(
        `INSERT INTO users(id, name, email, "emailVerified") VALUES ($1, 'Other User', $2, NOW())`,
        [999, otherUserEmail],
      );
    } finally {
      connection.release();
    }

    // Other user (not an editor/owner) should be able to create proposal
    const {configProposalId} = await fixture.engine.useCases.createConfigProposal(GLOBAL_CONTEXT, {
      configId,
      proposedValue: {newValue: 'allowed'},
      currentUserEmail: otherUserEmail,
    });

    expect(configProposalId).toBeDefined();
    const proposal = await fixture.engine.testing.configProposals.getById(configProposalId);
    expect(proposal?.proposedValue).toEqual({newValue: 'allowed'});
  });

  it('should create audit message (config_proposal_created)', async () => {
    const {configId} = await fixture.engine.useCases.createConfig(GLOBAL_CONTEXT, {
      name: 'audit_proposal_config',
      value: {x: 1},
      schema: {type: 'object'},
      description: 'Audit test',
      currentUserEmail: CURRENT_USER_EMAIL,
      editorEmails: [CURRENT_USER_EMAIL],
      ownerEmails: [],
      projectId: fixture.projectId,
    });

    const {configProposalId} = await fixture.engine.useCases.createConfigProposal(GLOBAL_CONTEXT, {
      configId,
      proposedValue: {newValue: {x: 2}},
      proposedDescription: {newDescription: 'Updated via proposal'},
      currentUserEmail: CURRENT_USER_EMAIL,
    });

    const messages = await fixture.engine.testing.auditMessages.list({
      lte: new Date('2100-01-01T00:00:00Z'),
      limit: 50,
      orderBy: 'created_at desc, id desc',
      projectId: fixture.projectId,
    });

    const proposalMessage = messages.find((m: any) => m.payload.type === 'config_proposal_created');
    expect(proposalMessage).toBeDefined();
    expect(proposalMessage?.payload).toEqual({
      type: 'config_proposal_created',
      proposalId: configProposalId,
      configId,
      proposedValue: {newValue: {x: 2}},
      proposedDescription: 'Updated via proposal',
      proposedSchema: {newSchema: undefined},
    });
  });

  it('should track the config version in the proposal', async () => {
    const {configId} = await fixture.engine.useCases.createConfig(GLOBAL_CONTEXT, {
      name: 'version_tracking_config',
      value: 1,
      schema: null,
      description: 'Version 1',
      currentUserEmail: CURRENT_USER_EMAIL,
      editorEmails: [CURRENT_USER_EMAIL],
      ownerEmails: [],
      projectId: fixture.projectId,
    });

    // Update config to version 2
    await fixture.engine.useCases.patchConfig(GLOBAL_CONTEXT, {
      configId,
      value: {newValue: 2},
      currentUserEmail: CURRENT_USER_EMAIL,
      prevVersion: 1,
    });

    // Create proposal - should track version 2
    const {configProposalId} = await fixture.engine.useCases.createConfigProposal(GLOBAL_CONTEXT, {
      configId,
      proposedValue: {newValue: 3},
      currentUserEmail: CURRENT_USER_EMAIL,
    });

    const proposal = await fixture.engine.testing.configProposals.getById(configProposalId);
    expect(proposal?.baseConfigVersion).toBe(2);
  });
});
