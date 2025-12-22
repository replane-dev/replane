import {GLOBAL_CONTEXT} from '@/engine/core/context';
import {BadRequestError} from '@/engine/core/errors';
import {normalizeEmail} from '@/engine/core/utils';
import {createUuidV4} from '@/engine/core/uuid';
import {asConfigSchema, asConfigValue} from '@/engine/core/zod';
import {beforeEach, describe, expect, it} from 'vitest';
import {emailToIdentity, useAppFixture} from './fixtures/trpc-fixture';

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

    await fixture.engine.testing.workspaceMembers.create([
      {
        workspaceId: fixture.workspaceId,
        email: OTHER_USER_EMAIL,
        role: 'member',
        createdAt: new Date(),
        updatedAt: new Date(),
      },
    ]);
  });

  it('should create a proposal with new description', async () => {
    const {configId} = await fixture.createConfig({
      overrides: [],
      name: 'desc_test_config',
      value: 'test',
      schema: null,
      description: 'Old description',
      identity: emailToIdentity(CURRENT_USER_EMAIL),
      editorEmails: [],
      maintainerEmails: [CURRENT_USER_EMAIL],
      projectId: fixture.projectId,
    });

    const {configProposalId} = await fixture.engine.useCases.createConfigProposal(GLOBAL_CONTEXT, {
      projectId: fixture.projectId,
      baseVersion: 1,
      configId,
      description: 'New description',
      editorEmails: [],
      maintainerEmails: [CURRENT_USER_EMAIL],
      environmentVariants: [
        {
          environmentId: fixture.productionEnvironmentId,
          value: asConfigValue('test'),
          schema: null,
          overrides: [],
          useDefaultSchema: false,
        },
        {
          environmentId: fixture.developmentEnvironmentId,
          value: asConfigValue('test'),
          schema: null,
          overrides: [],
          useDefaultSchema: false,
        },
      ],
      defaultVariant: {
        value: asConfigValue('test'),
        schema: null,
        overrides: [],
      },
      message: null,
      proposedDelete: false,
      identity: emailToIdentity(CURRENT_USER_EMAIL),
    });

    expect(configProposalId).toBeDefined();
    const proposal = await fixture.engine.testing.configProposals.getById({
      id: configProposalId,
      projectId: fixture.projectId,
    });
    expect(proposal?.description).toBe('New description');
    expect(proposal?.isDelete).toBe(false);
  });

  it('should create a deletion proposal', async () => {
    const {configId} = await fixture.createConfig({
      overrides: [],
      name: 'deletion_proposal_config',
      value: asConfigValue({x: 1}),
      schema: {type: 'object', properties: {x: {type: 'number'}}},
      description: 'To be deleted',
      identity: emailToIdentity(CURRENT_USER_EMAIL),
      editorEmails: [],
      maintainerEmails: [CURRENT_USER_EMAIL],
      projectId: fixture.projectId,
    });

    const {configProposalId} = await fixture.engine.useCases.createConfigProposal(GLOBAL_CONTEXT, {
      projectId: fixture.projectId,
      baseVersion: 1,
      configId,
      proposedDelete: true,
      description: 'To be deleted',
      editorEmails: [],
      maintainerEmails: [CURRENT_USER_EMAIL],
      defaultVariant: {
        value: asConfigValue({x: 1}),
        schema: asConfigSchema({type: 'object', properties: {x: {type: 'number'}}}),
        overrides: [],
      },
      message: null,
      environmentVariants: [
        {
          environmentId: fixture.productionEnvironmentId,
          value: asConfigValue({x: 1}),
          schema: asConfigSchema({type: 'object', properties: {x: {type: 'number'}}}),
          overrides: [],
          useDefaultSchema: false,
        },
      ],
      identity: emailToIdentity(CURRENT_USER_EMAIL),
    });

    const proposal = await fixture.engine.testing.configProposals.getById({
      id: configProposalId,
      projectId: fixture.projectId,
    });
    expect(proposal).toBeDefined();
    expect(proposal?.isDelete).toBe(true);
    expect(proposal?.description).toBe('To be deleted');
    expect(proposal?.members).toEqual([
      expect.objectContaining({email: CURRENT_USER_EMAIL, role: 'maintainer'}),
    ]);
  });

  it('should create a proposal with member changes', async () => {
    const {configId} = await fixture.createConfig({
      overrides: [],
      name: 'members_proposal_config',
      value: asConfigValue({x: 1}),
      schema: {type: 'object', properties: {x: {type: 'number'}}},
      description: 'Members test',
      identity: emailToIdentity(CURRENT_USER_EMAIL),
      editorEmails: [],
      maintainerEmails: [CURRENT_USER_EMAIL],
      projectId: fixture.projectId,
    });

    const newMemberEmail = normalizeEmail('newowner@example.com');
    const {configProposalId} = await fixture.engine.useCases.createConfigProposal(GLOBAL_CONTEXT, {
      projectId: fixture.projectId,
      baseVersion: 1,
      configId,
      proposedDelete: false,
      description: 'Members test',
      editorEmails: [],
      maintainerEmails: [newMemberEmail],
      environmentVariants: [
        {
          environmentId: fixture.productionEnvironmentId,
          value: asConfigValue({x: 1}),
          schema: asConfigSchema({type: 'object', properties: {x: {type: 'number'}}}),
          overrides: [],
          useDefaultSchema: false,
        },
        {
          environmentId: fixture.developmentEnvironmentId,
          value: asConfigValue({x: 1}),
          schema: asConfigSchema({type: 'object', properties: {x: {type: 'number'}}}),
          overrides: [],
          useDefaultSchema: false,
        },
      ],
      identity: emailToIdentity(CURRENT_USER_EMAIL),
      defaultVariant: {
        value: asConfigValue({x: 1}),
        schema: asConfigSchema({type: 'object', properties: {x: {type: 'number'}}}),
        overrides: [],
      },
      message: null,
    });

    expect(configProposalId).toBeDefined();

    const proposal = await fixture.engine.testing.configProposals.getById({
      id: configProposalId,
      projectId: fixture.projectId,
    });
    expect(proposal?.members).toEqual([
      expect.objectContaining({email: newMemberEmail, role: 'maintainer'}),
    ]);
  });

  it('should create a proposal with description and member changes', async () => {
    const {configId} = await fixture.createConfig({
      overrides: [],
      name: 'combined_proposal_config',
      value: asConfigValue({x: 1}),
      schema: asConfigSchema({type: 'object', properties: {x: {type: 'number'}}}),
      description: 'Original',
      identity: emailToIdentity(CURRENT_USER_EMAIL),
      editorEmails: [],
      maintainerEmails: [CURRENT_USER_EMAIL],
      projectId: fixture.projectId,
    });

    const newMemberEmail = normalizeEmail('combined@example.com');
    const {configProposalId} = await fixture.engine.useCases.createConfigProposal(GLOBAL_CONTEXT, {
      projectId: fixture.projectId,
      baseVersion: 1,
      configId,
      description: 'Updated description',
      editorEmails: [newMemberEmail],
      maintainerEmails: [],
      environmentVariants: [
        {
          environmentId: fixture.productionEnvironmentId,
          value: asConfigValue({x: 1}),
          schema: asConfigSchema({type: 'object', properties: {x: {type: 'number'}}}),
          overrides: [],
          useDefaultSchema: false,
        },
        {
          environmentId: fixture.developmentEnvironmentId,
          value: asConfigValue({x: 1}),
          schema: asConfigSchema({type: 'object', properties: {x: {type: 'number'}}}),
          overrides: [],
          useDefaultSchema: false,
        },
      ],
      identity: emailToIdentity(CURRENT_USER_EMAIL),
      defaultVariant: {
        value: asConfigValue({x: 1}),
        schema: asConfigSchema({type: 'object', properties: {x: {type: 'number'}}}),
        overrides: [],
      },
      message: null,
      proposedDelete: false,
    });

    const proposal = await fixture.engine.testing.configProposals.getById({
      id: configProposalId,
      projectId: fixture.projectId,
    });
    expect(proposal?.description).toBe('Updated description');
    expect(proposal?.members).toEqual([
      expect.objectContaining({email: newMemberEmail, role: 'editor'}),
    ]);
  });

  it('should create audit message including proposedMembers', async () => {
    const {configId} = await fixture.createConfig({
      overrides: [],
      name: 'audit_members_config',
      value: asConfigValue({x: 1}),
      schema: asConfigSchema({type: 'object'}),
      description: 'Audit members test',
      identity: emailToIdentity(CURRENT_USER_EMAIL),
      editorEmails: [],
      maintainerEmails: [CURRENT_USER_EMAIL],
      projectId: fixture.projectId,
    });

    const memberEmail = normalizeEmail('auditmember@example.com');
    const {configProposalId} = await fixture.engine.useCases.createConfigProposal(GLOBAL_CONTEXT, {
      projectId: fixture.projectId,
      baseVersion: 1,
      configId,
      description: 'Audit members test',
      editorEmails: [memberEmail],
      maintainerEmails: [],
      environmentVariants: [
        {
          environmentId: fixture.productionEnvironmentId,
          value: asConfigValue({x: 1}),
          schema: asConfigSchema({type: 'object'}),
          overrides: [],
          useDefaultSchema: false,
        },
        {
          environmentId: fixture.developmentEnvironmentId,
          value: asConfigValue({x: 1}),
          schema: asConfigSchema({type: 'object'}),
          overrides: [],
          useDefaultSchema: false,
        },
      ],
      identity: emailToIdentity(CURRENT_USER_EMAIL),
      defaultVariant: {
        value: asConfigValue({x: 1}),
        schema: asConfigSchema({type: 'object', properties: {x: {type: 'number'}}}),
        overrides: [],
      },
      message: null,
      proposedDelete: false,
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
      proposedMembers: [{email: memberEmail, role: 'editor'}],
    });
  });

  it('should throw BadRequestError when config does not exist', async () => {
    await expect(
      fixture.engine.useCases.createConfigProposal(GLOBAL_CONTEXT, {
        projectId: fixture.projectId,
        baseVersion: 1,
        configId: createUuidV4(),
        description: 'test',
        editorEmails: [],
        maintainerEmails: [],
        environmentVariants: [],
        identity: emailToIdentity(CURRENT_USER_EMAIL),
        defaultVariant: {
          value: asConfigValue('test'),
          schema: null,
          overrides: [],
        },
        message: null,
        proposedDelete: false,
      }),
    ).rejects.toBeInstanceOf(BadRequestError);
  });

  it('should allow proposal creation without edit permissions', async () => {
    const {configId} = await fixture.createConfig({
      overrides: [],
      name: 'permission_test_config',
      value: asConfigValue('test'),
      schema: null,
      description: 'Test',
      identity: emailToIdentity(CURRENT_USER_EMAIL),
      editorEmails: [],
      maintainerEmails: [CURRENT_USER_EMAIL],
      projectId: fixture.projectId,
    });

    // Other user (not an editor/owner) should be able to create proposal
    const {configProposalId} = await fixture.engine.useCases.createConfigProposal(GLOBAL_CONTEXT, {
      projectId: fixture.projectId,
      baseVersion: 1,
      configId,
      description: 'Proposed change',
      editorEmails: [],
      maintainerEmails: [CURRENT_USER_EMAIL],
      environmentVariants: [
        {
          environmentId: fixture.productionEnvironmentId,
          value: asConfigValue('test'),
          schema: null,
          overrides: [],
          useDefaultSchema: false,
        },
        {
          environmentId: fixture.developmentEnvironmentId,
          value: asConfigValue('test'),
          schema: null,
          overrides: [],
          useDefaultSchema: false,
        },
      ],
      identity: emailToIdentity(OTHER_USER_EMAIL),
      defaultVariant: {
        value: asConfigValue('test'),
        schema: null,
        overrides: [],
      },
      message: null,
      proposedDelete: false,
    });

    expect(configProposalId).toBeDefined();
    const proposal = await fixture.engine.testing.configProposals.getById({
      id: configProposalId,
      projectId: fixture.projectId,
    });
    expect(proposal?.description).toBe('Proposed change');
  });

  it('should create audit message (config_proposal_created)', async () => {
    const {configId} = await fixture.createConfig({
      overrides: [],
      name: 'audit_proposal_config',
      value: asConfigValue({x: 1}),
      schema: asConfigSchema({type: 'object'}),
      description: 'Audit test',
      identity: emailToIdentity(CURRENT_USER_EMAIL),
      editorEmails: [],
      maintainerEmails: [CURRENT_USER_EMAIL],
      projectId: fixture.projectId,
    });

    const {configProposalId} = await fixture.engine.useCases.createConfigProposal(GLOBAL_CONTEXT, {
      projectId: fixture.projectId,
      baseVersion: 1,
      configId,
      description: 'Updated via proposal',
      editorEmails: [],
      maintainerEmails: [CURRENT_USER_EMAIL],
      environmentVariants: [
        {
          environmentId: fixture.productionEnvironmentId,
          value: asConfigValue({x: 1}),
          schema: asConfigSchema({type: 'object'}),
          overrides: [],
          useDefaultSchema: false,
        },
        {
          environmentId: fixture.developmentEnvironmentId,
          value: asConfigValue({x: 1}),
          schema: asConfigSchema({type: 'object'}),
          overrides: [],
          useDefaultSchema: false,
        },
      ],
      identity: emailToIdentity(CURRENT_USER_EMAIL),
      defaultVariant: {
        value: asConfigValue({x: 1}),
        schema: asConfigSchema({type: 'object', properties: {x: {type: 'number'}}}),
        overrides: [],
      },
      message: null,
      proposedDelete: false,
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
    const {configId} = await fixture.createConfig({
      overrides: [],
      name: 'version_tracking_config',
      value: asConfigValue(1),
      schema: null,
      description: 'Version 1',
      identity: emailToIdentity(CURRENT_USER_EMAIL),
      editorEmails: [],
      maintainerEmails: [CURRENT_USER_EMAIL],
      projectId: fixture.projectId,
    });

    // Update config description to version 2
    await fixture.engine.useCases.updateConfig(GLOBAL_CONTEXT, {
      configId,
      description: 'Version 2 description',
      editorEmails: [],
      maintainerEmails: [CURRENT_USER_EMAIL],
      environmentVariants: [
        {
          environmentId: fixture.productionEnvironmentId,
          value: asConfigValue(1),
          schema: null,
          overrides: [],
          useDefaultSchema: false,
        },
        {
          environmentId: fixture.developmentEnvironmentId,
          value: asConfigValue(1),
          schema: null,
          overrides: [],
          useDefaultSchema: false,
        },
      ],
      identity: emailToIdentity(CURRENT_USER_EMAIL),
      prevVersion: 1,
      defaultVariant: {
        value: asConfigValue(1),
        schema: null,
        overrides: [],
      },
    });

    // Create proposal - should track version 2
    const {configProposalId} = await fixture.engine.useCases.createConfigProposal(GLOBAL_CONTEXT, {
      projectId: fixture.projectId,
      configId,
      baseVersion: 2,
      description: 'Version 3 proposal',
      editorEmails: [],
      maintainerEmails: [CURRENT_USER_EMAIL],
      environmentVariants: [
        {
          environmentId: fixture.productionEnvironmentId,
          value: asConfigValue(1),
          schema: null,
          overrides: [],
          useDefaultSchema: false,
        },
        {
          environmentId: fixture.developmentEnvironmentId,
          value: asConfigValue(1),
          schema: null,
          overrides: [],
          useDefaultSchema: false,
        },
      ],
      identity: emailToIdentity(CURRENT_USER_EMAIL),
      defaultVariant: {
        value: asConfigValue(1),
        schema: null,
        overrides: [],
      },
      message: null,
      proposedDelete: false,
    });

    const proposal = await fixture.engine.testing.configProposals.getById({
      id: configProposalId,
      projectId: fixture.projectId,
    });
    expect(proposal?.baseConfigVersion).toBe(2);
  });

  it('should throw error if config version has changed', async () => {
    const {configId} = await fixture.createConfig({
      overrides: [],
      name: 'version_check_config',
      value: asConfigValue({x: 1}),
      schema: null,
      description: 'Test',
      identity: emailToIdentity(CURRENT_USER_EMAIL),
      editorEmails: [],
      maintainerEmails: [CURRENT_USER_EMAIL],
      projectId: fixture.projectId,
    });

    // Update the config description (version becomes 2)
    await fixture.engine.useCases.updateConfig(GLOBAL_CONTEXT, {
      configId,
      description: 'Updated description',
      editorEmails: [],
      maintainerEmails: [CURRENT_USER_EMAIL],
      environmentVariants: [
        {
          environmentId: fixture.productionEnvironmentId,
          value: asConfigValue(1),
          schema: null,
          overrides: [],
          useDefaultSchema: false,
        },
        {
          environmentId: fixture.developmentEnvironmentId,
          value: asConfigValue(1),
          schema: null,
          overrides: [],
          useDefaultSchema: false,
        },
      ],
      identity: emailToIdentity(CURRENT_USER_EMAIL),
      prevVersion: 1,
      defaultVariant: {
        value: asConfigValue(1),
        schema: null,
        overrides: [],
      },
    });

    // Try to create a proposal based on version 1 (should fail)
    await expect(
      fixture.engine.useCases.createConfigProposal(GLOBAL_CONTEXT, {
        projectId: fixture.projectId,
        configId,
        baseVersion: 1,
        description: 'Another update',
        editorEmails: [],
        maintainerEmails: [CURRENT_USER_EMAIL],
        environmentVariants: [
          {
            environmentId: fixture.productionEnvironmentId,
            value: asConfigValue(1),
            schema: null,
            overrides: [],
            useDefaultSchema: false,
          },
          {
            environmentId: fixture.developmentEnvironmentId,
            value: asConfigValue(1),
            schema: null,
            overrides: [],
            useDefaultSchema: false,
          },
        ],
        identity: emailToIdentity(CURRENT_USER_EMAIL),
        defaultVariant: {
          value: asConfigValue(1),
          schema: null,
          overrides: [],
        },
        message: null,
        proposedDelete: false,
      }),
    ).rejects.toThrow('Config was edited by another user');
  });

  it('should allow deletion proposal to be created', async () => {
    const {configId} = await fixture.createConfig({
      overrides: [],
      name: 'delete_proposal_test',
      value: asConfigValue('test'),
      schema: null,
      description: 'To be deleted',
      identity: emailToIdentity(CURRENT_USER_EMAIL),
      editorEmails: [],
      maintainerEmails: [CURRENT_USER_EMAIL],
      projectId: fixture.projectId,
    });

    const {configProposalId} = await fixture.engine.useCases.createConfigProposal(GLOBAL_CONTEXT, {
      projectId: fixture.projectId,
      baseVersion: 1,
      configId,
      proposedDelete: true,
      description: 'To be deleted',
      editorEmails: [],
      maintainerEmails: [CURRENT_USER_EMAIL],
      environmentVariants: [],
      identity: emailToIdentity(CURRENT_USER_EMAIL),
      defaultVariant: {
        value: asConfigValue('test'),
        schema: null,
        overrides: [],
      },
      message: null,
    });

    expect(configProposalId).toBeDefined();
    const proposal = await fixture.engine.testing.configProposals.getById({
      id: configProposalId,
      projectId: fixture.projectId,
    });
    expect(proposal?.isDelete).toBe(true);
  });

  it('should create a proposal with variant value changes', async () => {
    const {configId, configVariantIds} = await fixture.createConfig({
      overrides: [],
      name: 'variant_proposal_config',
      value: asConfigValue({enabled: true}),
      schema: {type: 'object', properties: {enabled: {type: 'boolean'}}},
      description: 'Variant test',
      identity: emailToIdentity(CURRENT_USER_EMAIL),
      editorEmails: [],
      maintainerEmails: [CURRENT_USER_EMAIL],
      projectId: fixture.projectId,
    });

    // Get the production variant
    const prodVariantId = configVariantIds.find(
      v => v.environmentId === fixture.productionEnvironmentId,
    )?.variantId;
    expect(prodVariantId).toBeDefined();

    const {configProposalId} = await fixture.engine.useCases.createConfigProposal(GLOBAL_CONTEXT, {
      projectId: fixture.projectId,
      baseVersion: 1,
      configId,
      description: 'Variant test',
      editorEmails: [],
      maintainerEmails: [CURRENT_USER_EMAIL],
      environmentVariants: [
        {
          environmentId: fixture.productionEnvironmentId,
          value: asConfigValue({enabled: false}),
          schema: asConfigSchema({type: 'object', properties: {enabled: {type: 'boolean'}}}),
          overrides: [],
          useDefaultSchema: false,
        },
        {
          environmentId: fixture.developmentEnvironmentId,
          value: asConfigValue({enabled: true}),
          schema: asConfigSchema({type: 'object', properties: {enabled: {type: 'boolean'}}}),
          overrides: [],
          useDefaultSchema: false,
        },
      ],
      identity: emailToIdentity(CURRENT_USER_EMAIL),
      defaultVariant: {
        value: asConfigValue({enabled: true}),
        schema: asConfigSchema({type: 'object', properties: {enabled: {type: 'boolean'}}}),
        overrides: [],
      },
      message: null,
      proposedDelete: false,
    });

    expect(configProposalId).toBeDefined();
    const proposal = await fixture.engine.testing.configProposals.getById({
      id: configProposalId,
      projectId: fixture.projectId,
    });
    expect(proposal?.variants).toHaveLength(2);
    const prodVariantChange = proposal?.variants.find(
      vc => vc.environmentId === fixture.productionEnvironmentId,
    );
    expect(prodVariantChange?.value).toEqual({enabled: false});
  });

  it('should create a proposal with both config and variant changes', async () => {
    const {configId, configVariantIds} = await fixture.createConfig({
      overrides: [],
      name: 'combined_config_variant_proposal',
      value: asConfigValue({count: 10}),
      schema: asConfigSchema({type: 'object', properties: {count: {type: 'number'}}}),
      description: 'Original description',
      identity: emailToIdentity(CURRENT_USER_EMAIL),
      editorEmails: [],
      maintainerEmails: [CURRENT_USER_EMAIL],
      projectId: fixture.projectId,
    });

    // Get the production variant
    const prodVariantId = configVariantIds.find(
      v => v.environmentId === fixture.productionEnvironmentId,
    )?.variantId;

    const {configProposalId} = await fixture.engine.useCases.createConfigProposal(GLOBAL_CONTEXT, {
      projectId: fixture.projectId,
      baseVersion: 1,
      configId,
      description: 'Updated description',
      editorEmails: [],
      maintainerEmails: [CURRENT_USER_EMAIL],
      environmentVariants: [
        {
          environmentId: fixture.productionEnvironmentId,
          value: asConfigValue({count: 20}),
          schema: asConfigSchema({type: 'object', properties: {count: {type: 'number'}}}),
          overrides: [],
          useDefaultSchema: false,
        },
        {
          environmentId: fixture.developmentEnvironmentId,
          value: asConfigValue({count: 10}),
          schema: asConfigSchema({type: 'object', properties: {count: {type: 'number'}}}),
          overrides: [],
          useDefaultSchema: false,
        },
      ],
      identity: emailToIdentity(CURRENT_USER_EMAIL),
      defaultVariant: {
        value: asConfigValue({count: 10}),
        schema: asConfigSchema({type: 'object', properties: {count: {type: 'number'}}}),
        overrides: [],
      },
      message: null,
      proposedDelete: false,
    });

    const proposal = await fixture.engine.testing.configProposals.getById({
      id: configProposalId,
      projectId: fixture.projectId,
    });
    expect(proposal?.description).toBe('Updated description');
    expect(proposal?.variants).toHaveLength(2);
    const prodVariantChange = proposal?.variants.find(
      vc => vc.environmentId === fixture.productionEnvironmentId,
    );
    expect(prodVariantChange?.value).toEqual(asConfigValue({count: 20}));
  });
});
