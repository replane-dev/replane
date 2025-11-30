import {GLOBAL_CONTEXT} from '@/engine/core/context';
import {BadRequestError} from '@/engine/core/errors';
import {normalizeEmail} from '@/engine/core/utils';
import {createUuidV4} from '@/engine/core/uuid';
import {beforeEach, describe, expect, it} from 'vitest';
import {useAppFixture} from './fixtures/trpc-fixture';

const CURRENT_USER_EMAIL = normalizeEmail('test@example.com');
const OTHER_USER_EMAIL = normalizeEmail('other@example.com');

const OTHER_USER_ID = 2;

describe('createConfigProposal', () => {
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

    await fixture.engine.testing.organizationMembers.create([
      {
        organizationId: fixture.organizationId,
        email: OTHER_USER_EMAIL,
        role: 'member',
        createdAt: new Date(),
        updatedAt: new Date(),
      },
    ]);
  });

  it('should create a proposal with new description', async () => {
    const {configId} = await fixture.engine.useCases.createConfig(GLOBAL_CONTEXT, {
      overrides: [],
      name: 'desc_test_config',
      value: 'test',
      schema: null,
      description: 'Old description',
      currentUserEmail: CURRENT_USER_EMAIL,
      editorEmails: [],
      maintainerEmails: [CURRENT_USER_EMAIL],
      projectId: fixture.projectId,
    });

    const {configProposalId} = await fixture.engine.useCases.createConfigProposal(GLOBAL_CONTEXT, {
      projectId: fixture.projectId,
      baseVersion: 1,
      configId,
      proposedDescription: {newDescription: 'New description'},
      currentUserEmail: CURRENT_USER_EMAIL,
    });

    expect(configProposalId).toBeDefined();
    const proposal = await fixture.engine.testing.configProposals.getById({
      id: configProposalId,
      projectId: fixture.projectId,
    });
    expect(proposal?.proposedDescription).toBe('New description');
    expect(proposal?.proposedDelete).toBe(false);
    expect(proposal?.proposedMembers).toBeNull();
  });

  it('should create a deletion proposal', async () => {
    const {configId} = await fixture.engine.useCases.createConfig(GLOBAL_CONTEXT, {
      overrides: [],
      name: 'deletion_proposal_config',
      value: {x: 1},
      schema: {type: 'object', properties: {x: {type: 'number'}}},
      description: 'To be deleted',
      currentUserEmail: CURRENT_USER_EMAIL,
      editorEmails: [],
      maintainerEmails: [CURRENT_USER_EMAIL],
      projectId: fixture.projectId,
    });

    const {configProposalId} = await fixture.engine.useCases.createConfigProposal(GLOBAL_CONTEXT, {
      projectId: fixture.projectId,
      baseVersion: 1,
      configId,
      proposedDelete: true,
      currentUserEmail: CURRENT_USER_EMAIL,
    });

    const proposal = await fixture.engine.testing.configProposals.getById({
      id: configProposalId,
      projectId: fixture.projectId,
    });
    expect(proposal).toBeDefined();
    expect(proposal?.proposedDelete).toBe(true);
    expect(proposal?.proposedDescription).toBeNull();
    expect(proposal?.proposedMembers).toBeNull();
  });

  it('should create a proposal with member changes', async () => {
    const {configId} = await fixture.engine.useCases.createConfig(GLOBAL_CONTEXT, {
      overrides: [],
      name: 'members_proposal_config',
      value: {x: 1},
      schema: {type: 'object', properties: {x: {type: 'number'}}},
      description: 'Members test',
      currentUserEmail: CURRENT_USER_EMAIL,
      editorEmails: [],
      maintainerEmails: [CURRENT_USER_EMAIL],
      projectId: fixture.projectId,
    });

    const newMemberEmail = normalizeEmail('newowner@example.com');
    const {configProposalId} = await fixture.engine.useCases.createConfigProposal(GLOBAL_CONTEXT, {
      projectId: fixture.projectId,
      baseVersion: 1,
      configId,
      proposedMembers: {newMembers: [{email: newMemberEmail, role: 'maintainer'}]},
      currentUserEmail: CURRENT_USER_EMAIL,
    });

    expect(configProposalId).toBeDefined();

    const proposal = await fixture.engine.testing.configProposals.getById({
      id: configProposalId,
      projectId: fixture.projectId,
    });
    expect(proposal?.proposedMembers).toEqual({
      newMembers: [{email: newMemberEmail, role: 'maintainer'}],
    });
  });

  it('should create a proposal with description and member changes', async () => {
    const {configId} = await fixture.engine.useCases.createConfig(GLOBAL_CONTEXT, {
      overrides: [],
      name: 'combined_proposal_config',
      value: {x: 1},
      schema: {type: 'object', properties: {x: {type: 'number'}}},
      description: 'Original',
      currentUserEmail: CURRENT_USER_EMAIL,
      editorEmails: [],
      maintainerEmails: [CURRENT_USER_EMAIL],
      projectId: fixture.projectId,
    });

    const newMemberEmail = normalizeEmail('combined@example.com');
    const {configProposalId} = await fixture.engine.useCases.createConfigProposal(GLOBAL_CONTEXT, {
      projectId: fixture.projectId,
      baseVersion: 1,
      configId,
      proposedDescription: {newDescription: 'Updated description'},
      proposedMembers: {newMembers: [{email: newMemberEmail, role: 'editor'}]},
      currentUserEmail: CURRENT_USER_EMAIL,
    });

    const proposal = await fixture.engine.testing.configProposals.getById({
      id: configProposalId,
      projectId: fixture.projectId,
    });
    expect(proposal?.proposedDescription).toBe('Updated description');
    expect(proposal?.proposedMembers).toEqual({
      newMembers: [{email: newMemberEmail, role: 'editor'}],
    });
  });

  it('should create audit message including proposedMembers', async () => {
    const {configId} = await fixture.engine.useCases.createConfig(GLOBAL_CONTEXT, {
      overrides: [],
      name: 'audit_members_config',
      value: {x: 1},
      schema: {type: 'object'},
      description: 'Audit members test',
      currentUserEmail: CURRENT_USER_EMAIL,
      editorEmails: [],
      maintainerEmails: [CURRENT_USER_EMAIL],
      projectId: fixture.projectId,
    });

    const memberEmail = normalizeEmail('auditmember@example.com');
    const {configProposalId} = await fixture.engine.useCases.createConfigProposal(GLOBAL_CONTEXT, {
      projectId: fixture.projectId,
      baseVersion: 1,
      configId,
      proposedMembers: {newMembers: [{email: memberEmail, role: 'editor'}]},
      currentUserEmail: CURRENT_USER_EMAIL,
    });

    const messages = await fixture.engine.testing.auditLogs.list({
      lte: new Date('2100-01-01T00:00:00Z'),
      limit: 50,
      orderBy: 'created_at desc, id desc',
      projectId: fixture.projectId,
    });

    const proposalMessage = messages.find((m: any) => m.payload.type === 'config_proposal_created');
    expect(proposalMessage).toBeDefined();
    expect(proposalMessage?.payload).toMatchObject({
      type: 'config_proposal_created',
      proposalId: configProposalId,
      configId,
      proposedMembers: {newMembers: [{email: memberEmail, role: 'editor'}]},
    });
  });

  it('should throw BadRequestError when config does not exist', async () => {
    await expect(
      fixture.engine.useCases.createConfigProposal(GLOBAL_CONTEXT, {
        projectId: fixture.projectId,
        baseVersion: 1,
        configId: createUuidV4(),
        proposedDescription: {newDescription: 'test'},
        currentUserEmail: CURRENT_USER_EMAIL,
      }),
    ).rejects.toBeInstanceOf(BadRequestError);
  });

  it('should throw BadRequestError when no fields are proposed', async () => {
    const {configId} = await fixture.engine.useCases.createConfig(GLOBAL_CONTEXT, {
      overrides: [],
      name: 'empty_proposal_config',
      value: 'test',
      schema: null,
      description: 'Test',
      currentUserEmail: CURRENT_USER_EMAIL,
      editorEmails: [],
      maintainerEmails: [CURRENT_USER_EMAIL],
      projectId: fixture.projectId,
    });

    await expect(
      fixture.engine.useCases.createConfigProposal(GLOBAL_CONTEXT, {
        projectId: fixture.projectId,
        baseVersion: 1,
        configId,
        currentUserEmail: CURRENT_USER_EMAIL,
      }),
    ).rejects.toThrow('At least one field must be proposed');
  });

  it('should allow proposal creation without edit permissions', async () => {
    const {configId} = await fixture.engine.useCases.createConfig(GLOBAL_CONTEXT, {
      overrides: [],
      name: 'permission_test_config',
      value: 'test',
      schema: null,
      description: 'Test',
      currentUserEmail: CURRENT_USER_EMAIL,
      editorEmails: [],
      maintainerEmails: [CURRENT_USER_EMAIL],
      projectId: fixture.projectId,
    });

    // Other user (not an editor/owner) should be able to create proposal
    const {configProposalId} = await fixture.engine.useCases.createConfigProposal(GLOBAL_CONTEXT, {
      projectId: fixture.projectId,
      baseVersion: 1,
      configId,
      proposedDescription: {newDescription: 'Proposed change'},
      currentUserEmail: OTHER_USER_EMAIL,
    });

    expect(configProposalId).toBeDefined();
    const proposal = await fixture.engine.testing.configProposals.getById({
      id: configProposalId,
      projectId: fixture.projectId,
    });
    expect(proposal?.proposedDescription).toBe('Proposed change');
  });

  it('should create audit message (config_proposal_created)', async () => {
    const {configId} = await fixture.engine.useCases.createConfig(GLOBAL_CONTEXT, {
      overrides: [],
      name: 'audit_proposal_config',
      value: {x: 1},
      schema: {type: 'object'},
      description: 'Audit test',
      currentUserEmail: CURRENT_USER_EMAIL,
      editorEmails: [],
      maintainerEmails: [CURRENT_USER_EMAIL],
      projectId: fixture.projectId,
    });

    const {configProposalId} = await fixture.engine.useCases.createConfigProposal(GLOBAL_CONTEXT, {
      projectId: fixture.projectId,
      baseVersion: 1,
      configId,
      proposedDescription: {newDescription: 'Updated via proposal'},
      currentUserEmail: CURRENT_USER_EMAIL,
    });

    const messages = await fixture.engine.testing.auditLogs.list({
      lte: new Date('2100-01-01T00:00:00Z'),
      limit: 50,
      orderBy: 'created_at desc, id desc',
      projectId: fixture.projectId,
    });

    const proposalMessage = messages.find((m: any) => m.payload.type === 'config_proposal_created');
    expect(proposalMessage).toBeDefined();
    expect(proposalMessage?.payload).toMatchObject({
      type: 'config_proposal_created',
      proposalId: configProposalId,
      configId,
      proposedDescription: 'Updated via proposal',
    });
  });

  it('should track the config version in the proposal', async () => {
    const {configId} = await fixture.engine.useCases.createConfig(GLOBAL_CONTEXT, {
      overrides: [],
      name: 'version_tracking_config',
      value: 1,
      schema: null,
      description: 'Version 1',
      currentUserEmail: CURRENT_USER_EMAIL,
      editorEmails: [],
      maintainerEmails: [CURRENT_USER_EMAIL],
      projectId: fixture.projectId,
    });

    // Update config description to version 2
    await fixture.engine.useCases.patchConfig(GLOBAL_CONTEXT, {
      configId,
      description: {newDescription: 'Version 2 description'},
      currentUserEmail: CURRENT_USER_EMAIL,
      prevVersion: 1,
    });

    // Create proposal - should track version 2
    const {configProposalId} = await fixture.engine.useCases.createConfigProposal(GLOBAL_CONTEXT, {
      projectId: fixture.projectId,
      configId,
      baseVersion: 2,
      proposedDescription: {newDescription: 'Version 3 proposal'},
      currentUserEmail: CURRENT_USER_EMAIL,
    });

    const proposal = await fixture.engine.testing.configProposals.getById({
      id: configProposalId,
      projectId: fixture.projectId,
    });
    expect(proposal?.baseConfigVersion).toBe(2);
  });

  it('should throw error if config version has changed', async () => {
    const {configId} = await fixture.engine.useCases.createConfig(GLOBAL_CONTEXT, {
      overrides: [],
      name: 'version_check_config',
      value: {x: 1},
      schema: null,
      description: 'Test',
      currentUserEmail: CURRENT_USER_EMAIL,
      editorEmails: [],
      maintainerEmails: [CURRENT_USER_EMAIL],
      projectId: fixture.projectId,
    });

    // Update the config description (version becomes 2)
    await fixture.engine.useCases.patchConfig(GLOBAL_CONTEXT, {
      configId,
      description: {newDescription: 'Updated description'},
      currentUserEmail: CURRENT_USER_EMAIL,
      prevVersion: 1,
    });

    // Try to create a proposal based on version 1 (should fail)
    await expect(
      fixture.engine.useCases.createConfigProposal(GLOBAL_CONTEXT, {
        projectId: fixture.projectId,
        configId,
        baseVersion: 1,
        proposedDescription: {newDescription: 'Another update'},
        currentUserEmail: CURRENT_USER_EMAIL,
      }),
    ).rejects.toThrow('Config was edited by another user');
  });

  it('should allow deletion proposal to be created', async () => {
    const {configId} = await fixture.engine.useCases.createConfig(GLOBAL_CONTEXT, {
      overrides: [],
      name: 'delete_proposal_test',
      value: 'test',
      schema: null,
      description: 'To be deleted',
      currentUserEmail: CURRENT_USER_EMAIL,
      editorEmails: [],
      maintainerEmails: [CURRENT_USER_EMAIL],
      projectId: fixture.projectId,
    });

    const {configProposalId} = await fixture.engine.useCases.createConfigProposal(GLOBAL_CONTEXT, {
      projectId: fixture.projectId,
      baseVersion: 1,
      configId,
      proposedDelete: true,
      currentUserEmail: CURRENT_USER_EMAIL,
    });

    expect(configProposalId).toBeDefined();
    const proposal = await fixture.engine.testing.configProposals.getById({
      id: configProposalId,
      projectId: fixture.projectId,
    });
    expect(proposal?.proposedDelete).toBe(true);
  });

  it('should create a proposal with variant value changes', async () => {
    const {configId, configVariantIds} = await fixture.engine.useCases.createConfig(
      GLOBAL_CONTEXT,
      {
        overrides: [],
        name: 'variant_proposal_config',
        value: {enabled: true},
        schema: {type: 'object', properties: {enabled: {type: 'boolean'}}},
        description: 'Variant test',
        currentUserEmail: CURRENT_USER_EMAIL,
        editorEmails: [],
        maintainerEmails: [CURRENT_USER_EMAIL],
        projectId: fixture.projectId,
      },
    );

    // Get the production variant
    const prodVariantId = configVariantIds.find(
      v => v.environmentId === fixture.productionEnvironmentId,
    )?.variantId;
    expect(prodVariantId).toBeDefined();

    const {configProposalId} = await fixture.engine.useCases.createConfigProposal(GLOBAL_CONTEXT, {
      projectId: fixture.projectId,
      baseVersion: 1,
      configId,
      proposedVariants: [
        {
          configVariantId: prodVariantId!,
          baseVariantVersion: 1,
          proposedValue: {newValue: {enabled: false}},
        },
      ],
      currentUserEmail: CURRENT_USER_EMAIL,
    });

    expect(configProposalId).toBeDefined();
    const variantChanges =
      await fixture.engine.testing.configProposals.getVariantsByProposalId(configProposalId);
    expect(variantChanges).toHaveLength(1);
    expect(variantChanges[0].proposedValue).toEqual({enabled: false});
  });

  it('should create a proposal with both config and variant changes', async () => {
    const {configId, configVariantIds} = await fixture.engine.useCases.createConfig(
      GLOBAL_CONTEXT,
      {
        overrides: [],
        name: 'combined_config_variant_proposal',
        value: {count: 10},
        schema: {type: 'object', properties: {count: {type: 'number'}}},
        description: 'Original description',
        currentUserEmail: CURRENT_USER_EMAIL,
        editorEmails: [],
        maintainerEmails: [CURRENT_USER_EMAIL],
        projectId: fixture.projectId,
      },
    );

    // Get the production variant
    const prodVariantId = configVariantIds.find(
      v => v.environmentId === fixture.productionEnvironmentId,
    )?.variantId;

    const {configProposalId} = await fixture.engine.useCases.createConfigProposal(GLOBAL_CONTEXT, {
      projectId: fixture.projectId,
      baseVersion: 1,
      configId,
      proposedDescription: {newDescription: 'Updated description'},
      proposedVariants: [
        {
          configVariantId: prodVariantId!,
          baseVariantVersion: 1,
          proposedValue: {newValue: {count: 20}},
        },
      ],
      currentUserEmail: CURRENT_USER_EMAIL,
    });

    const proposal = await fixture.engine.testing.configProposals.getById({
      id: configProposalId,
      projectId: fixture.projectId,
    });
    expect(proposal?.proposedDescription).toBe('Updated description');

    const variantChanges =
      await fixture.engine.testing.configProposals.getVariantsByProposalId(configProposalId);
    expect(variantChanges).toHaveLength(1);
    expect(variantChanges[0].proposedValue).toEqual({count: 20});
  });
});
