import {GLOBAL_CONTEXT} from '@/engine/core/context';
import {BadRequestError} from '@/engine/core/errors';
import type {Override} from '@/engine/core/override-condition-schemas';
import {normalizeEmail} from '@/engine/core/utils';
import {createUuidV4} from '@/engine/core/uuid';
import {describe, expect, it} from 'vitest';
import {useAppFixture} from './fixtures/trpc-fixture';

const CURRENT_USER_EMAIL = normalizeEmail('test@example.com');

describe('createConfigVariantProposal', () => {
  const fixture = useAppFixture({authEmail: CURRENT_USER_EMAIL});

  it('should create a proposal with new value', async () => {
    const {configId, configVariantIds} = await fixture.engine.useCases.createConfig(
      GLOBAL_CONTEXT,
      {
        overrides: [],
        name: 'value_proposal_config',
        value: 'original value',
        schema: null,
        description: 'Test',
        currentUserEmail: CURRENT_USER_EMAIL,
        editorEmails: [],
        maintainerEmails: [CURRENT_USER_EMAIL],
        projectId: fixture.projectId,
      },
    );

    const productionVariantId = configVariantIds.find(
      v => v.environmentId === fixture.productionEnvironmentId,
    )!.variantId;

    const {configVariantProposalId} = await fixture.engine.useCases.createConfigVariantProposal(
      GLOBAL_CONTEXT,
      {
        baseVersion: 1,
        configVariantId: productionVariantId,
        proposedValue: {newValue: 'new value'},
        currentUserEmail: CURRENT_USER_EMAIL,
      },
    );

    expect(configVariantProposalId).toBeDefined();
    const proposal =
      await fixture.engine.testing.configVariantProposals.getById(configVariantProposalId);
    expect(proposal?.proposedValue).toBe('new value');
    expect(proposal?.proposedSchema).toBeUndefined();
    expect(proposal?.proposedOverrides).toBeUndefined();
  });

  it('should create a proposal with new schema', async () => {
    const {configId, configVariantIds} = await fixture.engine.useCases.createConfig(
      GLOBAL_CONTEXT,
      {
        overrides: [],
        name: 'schema_proposal_config',
        value: {x: 1},
        schema: {type: 'object', properties: {x: {type: 'number'}}},
        description: 'Test',
        currentUserEmail: CURRENT_USER_EMAIL,
        editorEmails: [],
        maintainerEmails: [CURRENT_USER_EMAIL],
        projectId: fixture.projectId,
      },
    );

    const productionVariantId = configVariantIds.find(
      v => v.environmentId === fixture.productionEnvironmentId,
    )!.variantId;

    const newSchema = {
      type: 'object',
      properties: {
        x: {type: 'number'},
        y: {type: 'string'},
      },
    };

    const {configVariantProposalId} = await fixture.engine.useCases.createConfigVariantProposal(
      GLOBAL_CONTEXT,
      {
        baseVersion: 1,
        configVariantId: productionVariantId,
        proposedSchema: {newSchema},
        currentUserEmail: CURRENT_USER_EMAIL,
      },
    );

    expect(configVariantProposalId).toBeDefined();
    const proposal =
      await fixture.engine.testing.configVariantProposals.getById(configVariantProposalId);
    expect(proposal?.proposedSchema).toEqual(newSchema);
  });

  it('should create a proposal with new overrides', async () => {
    const {configId, configVariantIds} = await fixture.engine.useCases.createConfig(
      GLOBAL_CONTEXT,
      {
        overrides: [],
        name: 'overrides_proposal_config',
        value: {x: 1},
        schema: {type: 'object', properties: {x: {type: 'number'}}},
        description: 'Test',
        currentUserEmail: CURRENT_USER_EMAIL,
        editorEmails: [],
        maintainerEmails: [CURRENT_USER_EMAIL],
        projectId: fixture.projectId,
      },
    );

    const productionVariantId = configVariantIds.find(
      v => v.environmentId === fixture.productionEnvironmentId,
    )!.variantId;

    const newOverrides: Override[] = [
      {
        name: 'Test Override',
        value: {x: 2},
        conditions: [
          {
            operator: 'equals',
            property: 'isTest',
            value: {type: 'literal', value: true},
          },
        ],
      },
    ];

    const {configVariantProposalId} = await fixture.engine.useCases.createConfigVariantProposal(
      GLOBAL_CONTEXT,
      {
        baseVersion: 1,
        configVariantId: productionVariantId,
        proposedOverrides: {newOverrides},
        currentUserEmail: CURRENT_USER_EMAIL,
      },
    );

    expect(configVariantProposalId).toBeDefined();
    const proposal =
      await fixture.engine.testing.configVariantProposals.getById(configVariantProposalId);
    expect(proposal?.proposedOverrides).toEqual(newOverrides);
  });

  it('should create a proposal with multiple changes', async () => {
    const {configId, configVariantIds} = await fixture.engine.useCases.createConfig(
      GLOBAL_CONTEXT,
      {
        overrides: [],
        name: 'multi_proposal_config',
        value: {x: 1},
        schema: {type: 'object', properties: {x: {type: 'number'}}},
        description: 'Test',
        currentUserEmail: CURRENT_USER_EMAIL,
        editorEmails: [],
        maintainerEmails: [CURRENT_USER_EMAIL],
        projectId: fixture.projectId,
      },
    );

    const productionVariantId = configVariantIds.find(
      v => v.environmentId === fixture.productionEnvironmentId,
    )!.variantId;

    const newSchema = {
      type: 'object',
      properties: {
        x: {type: 'number'},
        y: {type: 'string'},
      },
    };

    const {configVariantProposalId} = await fixture.engine.useCases.createConfigVariantProposal(
      GLOBAL_CONTEXT,
      {
        baseVersion: 1,
        configVariantId: productionVariantId,
        proposedValue: {newValue: {x: 2, y: 'test'}},
        proposedSchema: {newSchema},
        currentUserEmail: CURRENT_USER_EMAIL,
      },
    );

    expect(configVariantProposalId).toBeDefined();
    const proposal =
      await fixture.engine.testing.configVariantProposals.getById(configVariantProposalId);
    expect(proposal?.proposedValue).toEqual({x: 2, y: 'test'});
    expect(proposal?.proposedSchema).toEqual(newSchema);
  });

  it('should throw BadRequestError when variant does not exist', async () => {
    await expect(
      fixture.engine.useCases.createConfigVariantProposal(GLOBAL_CONTEXT, {
        baseVersion: 1,
        configVariantId: createUuidV4(),
        proposedValue: {newValue: 'test'},
        currentUserEmail: CURRENT_USER_EMAIL,
      }),
    ).rejects.toBeInstanceOf(BadRequestError);
  });

  it('should throw BadRequestError when no fields are proposed', async () => {
    const {configId, configVariantIds} = await fixture.engine.useCases.createConfig(
      GLOBAL_CONTEXT,
      {
        overrides: [],
        name: 'empty_proposal_config',
        value: 'test',
        schema: null,
        description: 'Test',
        currentUserEmail: CURRENT_USER_EMAIL,
        editorEmails: [],
        maintainerEmails: [CURRENT_USER_EMAIL],
        projectId: fixture.projectId,
      },
    );

    const productionVariantId = configVariantIds.find(
      v => v.environmentId === fixture.productionEnvironmentId,
    )!.variantId;

    await expect(
      fixture.engine.useCases.createConfigVariantProposal(GLOBAL_CONTEXT, {
        baseVersion: 1,
        configVariantId: productionVariantId,
        currentUserEmail: CURRENT_USER_EMAIL,
      }),
    ).rejects.toThrow('At least one field must be proposed');
  });

  it('should validate value against schema', async () => {
    const {configId, configVariantIds} = await fixture.engine.useCases.createConfig(
      GLOBAL_CONTEXT,
      {
        overrides: [],
        name: 'validation_config',
        value: {x: 1},
        schema: {type: 'object', properties: {x: {type: 'number'}}},
        description: 'Test',
        currentUserEmail: CURRENT_USER_EMAIL,
        editorEmails: [],
        maintainerEmails: [CURRENT_USER_EMAIL],
        projectId: fixture.projectId,
      },
    );

    const productionVariantId = configVariantIds.find(
      v => v.environmentId === fixture.productionEnvironmentId,
    )!.variantId;

    // Try to propose a value that doesn't match the existing schema
    await expect(
      fixture.engine.useCases.createConfigVariantProposal(GLOBAL_CONTEXT, {
        baseVersion: 1,
        configVariantId: productionVariantId,
        proposedValue: {newValue: 'not an object'},
        currentUserEmail: CURRENT_USER_EMAIL,
      }),
    ).rejects.toThrow('Proposed value does not match schema');
  });

  it('should validate proposed value against proposed schema', async () => {
    const {configId, configVariantIds} = await fixture.engine.useCases.createConfig(
      GLOBAL_CONTEXT,
      {
        overrides: [],
        name: 'cross_validation_config',
        value: {x: 1},
        schema: {type: 'object', properties: {x: {type: 'number'}}},
        description: 'Test',
        currentUserEmail: CURRENT_USER_EMAIL,
        editorEmails: [],
        maintainerEmails: [CURRENT_USER_EMAIL],
        projectId: fixture.projectId,
      },
    );

    const productionVariantId = configVariantIds.find(
      v => v.environmentId === fixture.productionEnvironmentId,
    )!.variantId;

    // Propose both a new schema and a value that doesn't match it
    await expect(
      fixture.engine.useCases.createConfigVariantProposal(GLOBAL_CONTEXT, {
        baseVersion: 1,
        configVariantId: productionVariantId,
        proposedValue: {newValue: 'string value'},
        proposedSchema: {newSchema: {type: 'number'}},
        currentUserEmail: CURRENT_USER_EMAIL,
      }),
    ).rejects.toThrow('Proposed value does not match schema');
  });

  it('should allow proposal creation without edit permissions', async () => {
    const otherUserEmail = normalizeEmail('other@example.com');

    const {configId, configVariantIds} = await fixture.engine.useCases.createConfig(
      GLOBAL_CONTEXT,
      {
        overrides: [],
        name: 'permission_test_config',
        value: 'test',
        schema: null,
        description: 'Test',
        currentUserEmail: CURRENT_USER_EMAIL,
        editorEmails: [],
        maintainerEmails: [CURRENT_USER_EMAIL],
        projectId: fixture.projectId,
      },
    );

    const productionVariantId = configVariantIds.find(
      v => v.environmentId === fixture.productionEnvironmentId,
    )!.variantId;

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

    // Other user (not an editor/maintainer) should be able to create proposal
    const {configVariantProposalId} = await fixture.engine.useCases.createConfigVariantProposal(
      GLOBAL_CONTEXT,
      {
        baseVersion: 1,
        configVariantId: productionVariantId,
        proposedValue: {newValue: 'proposed change'},
        currentUserEmail: otherUserEmail,
      },
    );

    expect(configVariantProposalId).toBeDefined();
    const proposal =
      await fixture.engine.testing.configVariantProposals.getById(configVariantProposalId);
    expect(proposal?.proposedValue).toBe('proposed change');
  });

  it('should create audit message (config_variant_proposal_created)', async () => {
    const {configId, configVariantIds} = await fixture.engine.useCases.createConfig(
      GLOBAL_CONTEXT,
      {
        overrides: [],
        name: 'audit_proposal_config',
        value: {x: 1},
        schema: {type: 'object'},
        description: 'Audit test',
        currentUserEmail: CURRENT_USER_EMAIL,
        editorEmails: [],
        maintainerEmails: [CURRENT_USER_EMAIL],
        projectId: fixture.projectId,
      },
    );

    const productionVariantId = configVariantIds.find(
      v => v.environmentId === fixture.productionEnvironmentId,
    )!.variantId;

    const {configVariantProposalId} = await fixture.engine.useCases.createConfigVariantProposal(
      GLOBAL_CONTEXT,
      {
        baseVersion: 1,
        configVariantId: productionVariantId,
        proposedValue: {newValue: {x: 2}},
        currentUserEmail: CURRENT_USER_EMAIL,
      },
    );

    const messages = await fixture.engine.testing.auditLogs.list({
      lte: new Date('2100-01-01T00:00:00Z'),
      limit: 50,
      orderBy: 'created_at desc, id desc',
      projectId: fixture.projectId,
    });

    const proposalMessage = messages.find(
      (m: any) => m.payload.type === 'config_variant_proposal_created',
    );
    expect(proposalMessage).toBeDefined();
    expect(proposalMessage?.payload).toMatchObject({
      type: 'config_variant_proposal_created',
      proposalId: configVariantProposalId,
      configVariantId: productionVariantId,
      proposedValue: {newValue: {x: 2}},
    });
  });

  it('should track the variant version in the proposal', async () => {
    const {configId, configVariantIds} = await fixture.engine.useCases.createConfig(
      GLOBAL_CONTEXT,
      {
        overrides: [],
        name: 'version_tracking_config',
        value: 1,
        schema: null,
        description: 'Version 1',
        currentUserEmail: CURRENT_USER_EMAIL,
        editorEmails: [],
        maintainerEmails: [CURRENT_USER_EMAIL],
        projectId: fixture.projectId,
      },
    );

    const productionVariantId = configVariantIds.find(
      v => v.environmentId === fixture.productionEnvironmentId,
    )!.variantId;

    // Update variant to version 2
    await fixture.engine.useCases.patchConfigVariant(GLOBAL_CONTEXT, {
      configVariantId: productionVariantId,
      value: {newValue: 2},
      currentUserEmail: CURRENT_USER_EMAIL,
      prevVersion: 1,
    });

    // Create proposal - should track version 2
    const {configVariantProposalId} = await fixture.engine.useCases.createConfigVariantProposal(
      GLOBAL_CONTEXT,
      {
        configVariantId: productionVariantId,
        baseVersion: 2,
        proposedValue: {newValue: 3},
        currentUserEmail: CURRENT_USER_EMAIL,
      },
    );

    const proposal =
      await fixture.engine.testing.configVariantProposals.getById(configVariantProposalId);
    expect(proposal?.baseVariantVersion).toBe(2);
  });

  it('should throw error if variant version has changed', async () => {
    const {configId, configVariantIds} = await fixture.engine.useCases.createConfig(
      GLOBAL_CONTEXT,
      {
        overrides: [],
        name: 'version_check_config',
        value: {x: 1},
        schema: null,
        description: 'Test',
        currentUserEmail: CURRENT_USER_EMAIL,
        editorEmails: [],
        maintainerEmails: [CURRENT_USER_EMAIL],
        projectId: fixture.projectId,
      },
    );

    const productionVariantId = configVariantIds.find(
      v => v.environmentId === fixture.productionEnvironmentId,
    )!.variantId;

    // Update the variant (version becomes 2)
    await fixture.engine.useCases.patchConfigVariant(GLOBAL_CONTEXT, {
      configVariantId: productionVariantId,
      value: {newValue: {x: 2}},
      currentUserEmail: CURRENT_USER_EMAIL,
      prevVersion: 1,
    });

    // Try to create a proposal based on version 1 (should fail)
    await expect(
      fixture.engine.useCases.createConfigVariantProposal(GLOBAL_CONTEXT, {
        configVariantId: productionVariantId,
        baseVersion: 1,
        proposedValue: {newValue: {x: 3}},
        currentUserEmail: CURRENT_USER_EMAIL,
      }),
    ).rejects.toThrow('Config variant was edited by another user');
  });

  it('should allow clearing schema by proposing null', async () => {
    const {configId, configVariantIds} = await fixture.engine.useCases.createConfig(
      GLOBAL_CONTEXT,
      {
        overrides: [],
        name: 'clear_schema_config',
        value: {x: 1},
        schema: {type: 'object', properties: {x: {type: 'number'}}},
        description: 'Test',
        currentUserEmail: CURRENT_USER_EMAIL,
        editorEmails: [],
        maintainerEmails: [CURRENT_USER_EMAIL],
        projectId: fixture.projectId,
      },
    );

    const productionVariantId = configVariantIds.find(
      v => v.environmentId === fixture.productionEnvironmentId,
    )!.variantId;

    const {configVariantProposalId} = await fixture.engine.useCases.createConfigVariantProposal(
      GLOBAL_CONTEXT,
      {
        baseVersion: 1,
        configVariantId: productionVariantId,
        proposedSchema: {newSchema: null},
        currentUserEmail: CURRENT_USER_EMAIL,
      },
    );

    expect(configVariantProposalId).toBeDefined();
    const proposal =
      await fixture.engine.testing.configVariantProposals.getById(configVariantProposalId);
    expect(proposal?.proposedSchema).toBeNull();
  });

  it('should include message in proposal', async () => {
    const {configId, configVariantIds} = await fixture.engine.useCases.createConfig(
      GLOBAL_CONTEXT,
      {
        overrides: [],
        name: 'message_test_config',
        value: 'test',
        schema: null,
        description: 'Test',
        currentUserEmail: CURRENT_USER_EMAIL,
        editorEmails: [],
        maintainerEmails: [CURRENT_USER_EMAIL],
        projectId: fixture.projectId,
      },
    );

    const productionVariantId = configVariantIds.find(
      v => v.environmentId === fixture.productionEnvironmentId,
    )!.variantId;

    const {configVariantProposalId} = await fixture.engine.useCases.createConfigVariantProposal(
      GLOBAL_CONTEXT,
      {
        baseVersion: 1,
        configVariantId: productionVariantId,
        proposedValue: {newValue: 'new value'},
        message: 'This is a test proposal',
        currentUserEmail: CURRENT_USER_EMAIL,
      },
    );

    const proposal =
      await fixture.engine.testing.configVariantProposals.getById(configVariantProposalId);
    expect(proposal?.message).toBe('This is a test proposal');
  });
});
