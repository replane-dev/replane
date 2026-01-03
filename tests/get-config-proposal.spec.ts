import {GLOBAL_CONTEXT} from '@/engine/core/context';
import {BadRequestError} from '@/engine/core/errors';
import {normalizeEmail, stringifyJsonc} from '@/engine/core/utils';
import {createUuidV4} from '@/engine/core/uuid';
import type {ConfigSchema, ConfigValue} from '@/engine/core/zod';
import {beforeEach, describe, expect, it} from 'vitest';
import {useAppFixture} from './fixtures/app-fixture';

function asConfigValue(value: unknown): ConfigValue {
  return stringifyJsonc(value) as ConfigValue;
}

function asConfigSchema(value: unknown): ConfigSchema {
  return stringifyJsonc(value) as ConfigSchema;
}

const CURRENT_USER_EMAIL = normalizeEmail('test@example.com');
const OTHER_USER_EMAIL = normalizeEmail('other@example.com');
const THIRD_USER_EMAIL = normalizeEmail('third@example.com');
const NON_MEMBER_USER_EMAIL = normalizeEmail('non-member@example.com');

const OTHER_USER_ID = 2;
const THIRD_USER_ID = 3;
const NON_MEMBER_USER_ID = 4;

describe('getConfigProposal', () => {
  const fixture = useAppFixture({authEmail: CURRENT_USER_EMAIL});

  beforeEach(async () => {
    const connection = await fixture.engine.testing.pool.connect();
    try {
      await connection.query(
        `INSERT INTO users(id, name, email, "emailVerified") VALUES ($1, 'Other', $2, NOW()), ($3, 'Third', $4, NOW()), ($5, 'Non-Member', $6, NOW())`,
        [
          OTHER_USER_ID,
          OTHER_USER_EMAIL,
          THIRD_USER_ID,
          THIRD_USER_EMAIL,
          NON_MEMBER_USER_ID,
          NON_MEMBER_USER_EMAIL,
        ],
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
    await fixture.engine.testing.workspaceMembers.create([
      {
        workspaceId: fixture.workspaceId,
        email: THIRD_USER_EMAIL,
        role: 'member',
        createdAt: new Date(),
        updatedAt: new Date(),
      },
    ]);
  });

  it('should get a pending proposal with description change', async () => {
    const {configId} = await fixture.createConfig({
      overrides: [],
      name: 'get_proposal_description',
      value: asConfigValue({enabled: false}),
      schema: null,
      description: 'Original description',
      identity: await fixture.emailToIdentity(CURRENT_USER_EMAIL),
      editorEmails: [],
      maintainerEmails: [CURRENT_USER_EMAIL, OTHER_USER_EMAIL],
      projectId: fixture.projectId,
    });

    const {configProposalId} = await fixture.engine.useCases.createConfigProposal(GLOBAL_CONTEXT, {
      projectId: fixture.projectId,
      baseVersion: 1,
      configId,
      description: 'Updated description',
      editorEmails: [],
      maintainerEmails: [CURRENT_USER_EMAIL, OTHER_USER_EMAIL],
      environmentVariants: [
        {
          environmentId: fixture.productionEnvironmentId,
          value: asConfigValue({enabled: false}),
          schema: null,
          overrides: [],
          useBaseSchema: false,
        },
        {
          environmentId: fixture.developmentEnvironmentId,
          value: asConfigValue({enabled: false}),
          schema: null,
          overrides: [],
          useBaseSchema: false,
        },
      ],
      identity: await fixture.emailToIdentity(OTHER_USER_EMAIL),
      proposedDelete: false,
      defaultVariant: {value: asConfigValue({x: 1}), schema: null, overrides: []},
      message: null,
    });

    const result = await fixture.engine.useCases.getConfigProposal(GLOBAL_CONTEXT, {
      projectId: fixture.projectId,
      proposalId: configProposalId,
      identity: await fixture.emailToIdentity(CURRENT_USER_EMAIL),
    });

    expect(result.proposal).toMatchObject({
      id: configProposalId,
      configId,
      configName: 'get_proposal_description',
      authorId: OTHER_USER_ID,
      authorEmail: OTHER_USER_EMAIL,
      status: 'pending',
      proposedDelete: false,
      rejectedAt: null,
      approvedAt: null,
      reviewerId: null,
      reviewerEmail: null,
    });
    expect(result.proposal.proposed.description).toBe('Updated description');
    expect(result.proposal.createdAt).toBeDefined();
    expect(result.proposal.baseConfigVersion).toBe(1);
  });

  it('should indicate maintainers as approvers for member changes', async () => {
    const {configId} = await fixture.createConfig({
      overrides: [],
      name: 'get_proposal_members',
      value: asConfigValue({enabled: false}),
      schema: null,
      description: 'Original description',
      identity: await fixture.emailToIdentity(CURRENT_USER_EMAIL),
      editorEmails: [],
      maintainerEmails: [CURRENT_USER_EMAIL, OTHER_USER_EMAIL],
      projectId: fixture.projectId,
    });

    const {configProposalId} = await fixture.engine.useCases.createConfigProposal(GLOBAL_CONTEXT, {
      projectId: fixture.projectId,
      baseVersion: 1,
      configId,
      description: 'Original description',
      editorEmails: [THIRD_USER_EMAIL],
      maintainerEmails: [],
      environmentVariants: [
        {
          environmentId: fixture.productionEnvironmentId,
          value: asConfigValue({enabled: false}),
          schema: null,
          overrides: [],
          useBaseSchema: false,
        },
        {
          environmentId: fixture.developmentEnvironmentId,
          value: asConfigValue({enabled: false}),
          schema: null,
          overrides: [],
          useBaseSchema: false,
        },
      ],
      identity: await fixture.emailToIdentity(CURRENT_USER_EMAIL),
      proposedDelete: false,
      defaultVariant: {value: asConfigValue({x: 1}), schema: null, overrides: []},
      message: null,
    });

    const result = await fixture.engine.useCases.getConfigProposal(GLOBAL_CONTEXT, {
      projectId: fixture.projectId,
      proposalId: configProposalId,
      identity: await fixture.emailToIdentity(CURRENT_USER_EMAIL),
    });

    expect(result.proposal.approverRole).toBe('maintainers');
    expect(result.proposal.approverReason).toBe('Membership changes require maintainer approval.');
  });

  it('should indicate maintainers as approvers for deletion proposals', async () => {
    const {configId} = await fixture.createConfig({
      overrides: [],
      name: 'get_proposal_delete',
      value: asConfigValue({enabled: false}),
      schema: null,
      description: 'To be deleted',
      identity: await fixture.emailToIdentity(CURRENT_USER_EMAIL),
      editorEmails: [],
      maintainerEmails: [CURRENT_USER_EMAIL, OTHER_USER_EMAIL],
      projectId: fixture.projectId,
    });

    const {configProposalId} = await fixture.engine.useCases.createConfigProposal(GLOBAL_CONTEXT, {
      projectId: fixture.projectId,
      baseVersion: 1,
      configId,
      proposedDelete: true,
      description: 'To be deleted',
      editorEmails: [],
      maintainerEmails: [CURRENT_USER_EMAIL, OTHER_USER_EMAIL],
      environmentVariants: [
        {
          environmentId: fixture.productionEnvironmentId,
          value: asConfigValue({enabled: false}),
          schema: null,
          overrides: [],
          useBaseSchema: false,
        },
        {
          environmentId: fixture.developmentEnvironmentId,
          value: asConfigValue({enabled: false}),
          schema: null,
          overrides: [],
          useBaseSchema: false,
        },
      ],
      defaultVariant: {value: asConfigValue({x: 1}), schema: null, overrides: []},
      message: null,
      identity: await fixture.emailToIdentity(OTHER_USER_EMAIL),
    });

    const result = await fixture.engine.useCases.getConfigProposal(GLOBAL_CONTEXT, {
      projectId: fixture.projectId,
      proposalId: configProposalId,
      identity: await fixture.emailToIdentity(CURRENT_USER_EMAIL),
    });

    expect(result.proposal.proposedDelete).toBe(true);
    expect(result.proposal.approverRole).toBe('maintainers');
    expect(result.proposal.approverReason).toBe('Deletion requests require maintainer approval.');
  });

  it('should get a pending proposal with member changes', async () => {
    const {configId} = await fixture.createConfig({
      overrides: [],
      name: 'get_proposal_member_changes',
      value: asConfigValue({enabled: false}),
      schema: null,
      description: 'Original description',
      identity: await fixture.emailToIdentity(CURRENT_USER_EMAIL),
      editorEmails: [],
      maintainerEmails: [CURRENT_USER_EMAIL, OTHER_USER_EMAIL],
      projectId: fixture.projectId,
    });

    const {configProposalId} = await fixture.engine.useCases.createConfigProposal(GLOBAL_CONTEXT, {
      projectId: fixture.projectId,
      baseVersion: 1,
      configId,
      description: 'Original description',
      editorEmails: [THIRD_USER_EMAIL],
      maintainerEmails: [],
      environmentVariants: [
        {
          environmentId: fixture.productionEnvironmentId,
          value: asConfigValue({enabled: false}),
          schema: null,
          overrides: [],
          useBaseSchema: false,
        },
        {
          environmentId: fixture.developmentEnvironmentId,
          value: asConfigValue({enabled: false}),
          schema: null,
          overrides: [],
          useBaseSchema: false,
        },
      ],
      identity: await fixture.emailToIdentity(OTHER_USER_EMAIL),
      proposedDelete: false,
      defaultVariant: {value: asConfigValue({x: 1}), schema: null, overrides: []},
      message: null,
    });

    const result = await fixture.engine.useCases.getConfigProposal(GLOBAL_CONTEXT, {
      projectId: fixture.projectId,
      proposalId: configProposalId,
      identity: await fixture.emailToIdentity(CURRENT_USER_EMAIL),
    });

    expect(result.proposal).toMatchObject({
      id: configProposalId,
      configId,
      configName: 'get_proposal_member_changes',
      status: 'pending',
    });
    expect(result.proposal.proposed.description).toBe('Original description');
    expect(result.proposal.proposed.members).toEqual([{email: THIRD_USER_EMAIL, role: 'editor'}]);
  });

  it('should get a pending proposal with multiple changes', async () => {
    const {configId} = await fixture.createConfig({
      overrides: [],
      name: 'get_proposal_multiple',
      value: asConfigValue({enabled: false}),
      schema: null,
      description: 'Original description',
      identity: await fixture.emailToIdentity(CURRENT_USER_EMAIL),
      editorEmails: [],
      maintainerEmails: [CURRENT_USER_EMAIL, OTHER_USER_EMAIL],
      projectId: fixture.projectId,
    });

    const {configProposalId} = await fixture.engine.useCases.createConfigProposal(GLOBAL_CONTEXT, {
      projectId: fixture.projectId,
      baseVersion: 1,
      configId,
      description: 'Updated description',
      editorEmails: [THIRD_USER_EMAIL],
      maintainerEmails: [],
      environmentVariants: [
        {
          environmentId: fixture.productionEnvironmentId,
          value: asConfigValue({enabled: false}),
          schema: null,
          overrides: [],
          useBaseSchema: false,
        },
        {
          environmentId: fixture.developmentEnvironmentId,
          value: asConfigValue({enabled: false}),
          schema: null,
          overrides: [],
          useBaseSchema: false,
        },
      ],
      identity: await fixture.emailToIdentity(OTHER_USER_EMAIL),
      proposedDelete: false,
      defaultVariant: {value: asConfigValue({x: 1}), schema: null, overrides: []},
      message: null,
    });

    const result = await fixture.engine.useCases.getConfigProposal(GLOBAL_CONTEXT, {
      projectId: fixture.projectId,
      proposalId: configProposalId,
      identity: await fixture.emailToIdentity(CURRENT_USER_EMAIL),
    });

    expect(result.proposal).toMatchObject({
      id: configProposalId,
      configId,
      configName: 'get_proposal_multiple',
      status: 'pending',
    });
    expect(result.proposal.proposed.description).toBe('Updated description');
    expect(result.proposal.proposed.members).toEqual([{email: THIRD_USER_EMAIL, role: 'editor'}]);
  });

  it('should get an approved proposal', async () => {
    const {configId} = await fixture.createConfig({
      overrides: [],
      name: 'get_proposal_approved',
      value: asConfigValue({enabled: false}),
      schema: null,
      description: 'Original description',
      identity: await fixture.emailToIdentity(CURRENT_USER_EMAIL),
      editorEmails: [],
      maintainerEmails: [CURRENT_USER_EMAIL, OTHER_USER_EMAIL],
      projectId: fixture.projectId,
    });

    const {configProposalId} = await fixture.engine.useCases.createConfigProposal(GLOBAL_CONTEXT, {
      projectId: fixture.projectId,
      baseVersion: 1,
      configId,
      description: 'New description',
      editorEmails: [],
      maintainerEmails: [CURRENT_USER_EMAIL, OTHER_USER_EMAIL],
      environmentVariants: [
        {
          environmentId: fixture.productionEnvironmentId,
          value: asConfigValue({enabled: false}),
          schema: null,
          overrides: [],
          useBaseSchema: false,
        },
        {
          environmentId: fixture.developmentEnvironmentId,
          value: asConfigValue({enabled: false}),
          schema: null,
          overrides: [],
          useBaseSchema: false,
        },
      ],
      identity: await fixture.emailToIdentity(OTHER_USER_EMAIL),
      proposedDelete: false,
      defaultVariant: {value: asConfigValue({x: 1}), schema: null, overrides: []},
      message: null,
    });

    // Approve the proposal
    await fixture.engine.useCases.approveConfigProposal(GLOBAL_CONTEXT, {
      projectId: fixture.projectId,
      proposalId: configProposalId,
      identity: await fixture.emailToIdentity(CURRENT_USER_EMAIL),
    });

    const result = await fixture.engine.useCases.getConfigProposal(GLOBAL_CONTEXT, {
      projectId: fixture.projectId,
      proposalId: configProposalId,
      identity: await fixture.emailToIdentity(CURRENT_USER_EMAIL),
    });

    expect(result.proposal.status).toBe('approved');
    expect(result.proposal.approvedAt).toBeDefined();
    expect(result.proposal.reviewerId).toBe(1); // CURRENT_USER_ID
    expect(result.proposal.reviewerEmail).toBe(CURRENT_USER_EMAIL);
    expect(result.proposal.rejectedAt).toBeNull();
  });

  it('should get a rejected proposal', async () => {
    const {configId} = await fixture.createConfig({
      overrides: [],
      name: 'get_proposal_rejected',
      value: asConfigValue({enabled: false}),
      schema: null,
      description: 'Original description',
      identity: await fixture.emailToIdentity(CURRENT_USER_EMAIL),
      editorEmails: [],
      maintainerEmails: [CURRENT_USER_EMAIL, OTHER_USER_EMAIL],
      projectId: fixture.projectId,
    });

    const {configProposalId} = await fixture.engine.useCases.createConfigProposal(GLOBAL_CONTEXT, {
      projectId: fixture.projectId,
      baseVersion: 1,
      configId,
      description: 'New description',
      editorEmails: [],
      maintainerEmails: [CURRENT_USER_EMAIL, OTHER_USER_EMAIL],
      environmentVariants: [
        {
          environmentId: fixture.productionEnvironmentId,
          value: asConfigValue({enabled: false}),
          schema: null,
          overrides: [],
          useBaseSchema: false,
        },
        {
          environmentId: fixture.developmentEnvironmentId,
          value: asConfigValue({enabled: false}),
          schema: null,
          overrides: [],
          useBaseSchema: false,
        },
      ],
      identity: await fixture.emailToIdentity(OTHER_USER_EMAIL),
      proposedDelete: false,
      defaultVariant: {value: asConfigValue({x: 1}), schema: null, overrides: []},
      message: null,
    });

    // Reject the proposal
    await fixture.engine.useCases.rejectConfigProposal(GLOBAL_CONTEXT, {
      proposalId: configProposalId,
      identity: await fixture.emailToIdentity(CURRENT_USER_EMAIL),
      projectId: fixture.projectId,
    });

    const result = await fixture.engine.useCases.getConfigProposal(GLOBAL_CONTEXT, {
      projectId: fixture.projectId,
      proposalId: configProposalId,
      identity: await fixture.emailToIdentity(CURRENT_USER_EMAIL),
    });

    expect(result.proposal.status).toBe('rejected');
    expect(result.proposal.rejectedAt).toBeDefined();
    expect(result.proposal.reviewerId).toBe(1); // CURRENT_USER_ID
    expect(result.proposal.reviewerEmail).toBe(CURRENT_USER_EMAIL);
    expect(result.proposal.approvedAt).toBeNull();
    expect(result.proposal.rejectedInFavorOfProposalId).toBeNull();
  });

  it('should get a rejected proposal with rejectedInFavorOfProposalId', async () => {
    const {configId} = await fixture.createConfig({
      overrides: [],
      name: 'get_proposal_rejected_in_favor',
      value: asConfigValue({enabled: false}),
      schema: null,
      description: 'Original description',
      identity: await fixture.emailToIdentity(CURRENT_USER_EMAIL),
      editorEmails: [],
      maintainerEmails: [CURRENT_USER_EMAIL, OTHER_USER_EMAIL, THIRD_USER_EMAIL],
      projectId: fixture.projectId,
    });

    // Create two proposals
    const {configProposalId: proposal1Id} = await fixture.engine.useCases.createConfigProposal(
      GLOBAL_CONTEXT,
      {
        projectId: fixture.projectId,
        baseVersion: 1,
        configId,
        description: 'First description',
        editorEmails: [],
        maintainerEmails: [CURRENT_USER_EMAIL, OTHER_USER_EMAIL, THIRD_USER_EMAIL],
        environmentVariants: [
          {
            environmentId: fixture.productionEnvironmentId,
            value: asConfigValue({enabled: false}),
            schema: null,
            overrides: [],
            useBaseSchema: false,
          },
          {
            environmentId: fixture.developmentEnvironmentId,
            value: asConfigValue({enabled: false}),
            schema: null,
            overrides: [],
            useBaseSchema: false,
          },
        ],
        identity: await fixture.emailToIdentity(OTHER_USER_EMAIL),
        proposedDelete: false,
        defaultVariant: {value: asConfigValue({x: 1}), schema: null, overrides: []},
        message: null,
      },
    );

    const {configProposalId: proposal2Id} = await fixture.engine.useCases.createConfigProposal(
      GLOBAL_CONTEXT,
      {
        projectId: fixture.projectId,
        baseVersion: 1,
        configId,
        description: 'Second description',
        editorEmails: [],
        maintainerEmails: [CURRENT_USER_EMAIL, OTHER_USER_EMAIL, THIRD_USER_EMAIL],
        environmentVariants: [
          {
            environmentId: fixture.productionEnvironmentId,
            value: asConfigValue({enabled: false}),
            schema: null,
            overrides: [],
            useBaseSchema: false,
          },
          {
            environmentId: fixture.developmentEnvironmentId,
            value: asConfigValue({enabled: false}),
            schema: null,
            overrides: [],
            useBaseSchema: false,
          },
        ],
        identity: await fixture.emailToIdentity(THIRD_USER_EMAIL),
        proposedDelete: false,
        defaultVariant: {value: asConfigValue({x: 1}), schema: null, overrides: []},
        message: null,
      },
    );

    // Approve proposal 2 (which should reject proposal 1 in favor of proposal 2)
    await fixture.engine.useCases.approveConfigProposal(GLOBAL_CONTEXT, {
      projectId: fixture.projectId,
      proposalId: proposal2Id,
      identity: await fixture.emailToIdentity(CURRENT_USER_EMAIL),
    });

    // Get the rejected proposal
    const result = await fixture.engine.useCases.getConfigProposal(GLOBAL_CONTEXT, {
      projectId: fixture.projectId,
      proposalId: proposal1Id,
      identity: await fixture.emailToIdentity(CURRENT_USER_EMAIL),
    });

    expect(result.proposal.status).toBe('rejected');
    expect(result.proposal.rejectedAt).toBeDefined();
    expect(result.proposal.rejectedInFavorOfProposalId).toBe(proposal2Id);
  });

  it('should include author email when author exists', async () => {
    const {configId} = await fixture.createConfig({
      overrides: [],
      name: 'get_proposal_author',
      value: asConfigValue({enabled: false}),
      schema: null,
      description: 'Original description',
      identity: await fixture.emailToIdentity(CURRENT_USER_EMAIL),
      editorEmails: [],
      maintainerEmails: [CURRENT_USER_EMAIL, OTHER_USER_EMAIL],
      projectId: fixture.projectId,
    });

    const {configProposalId} = await fixture.engine.useCases.createConfigProposal(GLOBAL_CONTEXT, {
      projectId: fixture.projectId,
      baseVersion: 1,
      configId,
      description: 'New description',
      editorEmails: [],
      maintainerEmails: [CURRENT_USER_EMAIL, OTHER_USER_EMAIL],
      environmentVariants: [
        {
          environmentId: fixture.productionEnvironmentId,
          value: asConfigValue({enabled: false}),
          schema: null,
          overrides: [],
          useBaseSchema: false,
        },
        {
          environmentId: fixture.developmentEnvironmentId,
          value: asConfigValue({enabled: false}),
          schema: null,
          overrides: [],
          useBaseSchema: false,
        },
      ],
      identity: await fixture.emailToIdentity(OTHER_USER_EMAIL),
      proposedDelete: false,
      defaultVariant: {value: asConfigValue({x: 1}), schema: null, overrides: []},
      message: null,
    });

    const result = await fixture.engine.useCases.getConfigProposal(GLOBAL_CONTEXT, {
      projectId: fixture.projectId,
      proposalId: configProposalId,
      identity: await fixture.emailToIdentity(CURRENT_USER_EMAIL),
    });

    expect(result.proposal.authorId).toBe(OTHER_USER_ID);
    expect(result.proposal.authorEmail).toBe(OTHER_USER_EMAIL);
  });

  it('should include reviewer email when proposal is reviewed', async () => {
    const {configId} = await fixture.createConfig({
      overrides: [],
      name: 'get_proposal_reviewer',
      value: asConfigValue({enabled: false}),
      schema: null,
      description: 'Original description',
      identity: await fixture.emailToIdentity(CURRENT_USER_EMAIL),
      editorEmails: [],
      maintainerEmails: [CURRENT_USER_EMAIL, OTHER_USER_EMAIL],
      projectId: fixture.projectId,
    });

    const {configProposalId} = await fixture.engine.useCases.createConfigProposal(GLOBAL_CONTEXT, {
      projectId: fixture.projectId,
      baseVersion: 1,
      configId,
      description: 'New description',
      editorEmails: [],
      maintainerEmails: [CURRENT_USER_EMAIL, OTHER_USER_EMAIL],
      environmentVariants: [
        {
          environmentId: fixture.productionEnvironmentId,
          value: asConfigValue({enabled: false}),
          schema: null,
          overrides: [],
          useBaseSchema: false,
        },
        {
          environmentId: fixture.developmentEnvironmentId,
          value: asConfigValue({enabled: false}),
          schema: null,
          overrides: [],
          useBaseSchema: false,
        },
      ],
      identity: await fixture.emailToIdentity(OTHER_USER_EMAIL),
      proposedDelete: false,
      defaultVariant: {value: asConfigValue({x: 1}), schema: null, overrides: []},
      message: null,
    });

    await fixture.engine.useCases.approveConfigProposal(GLOBAL_CONTEXT, {
      projectId: fixture.projectId,
      proposalId: configProposalId,
      identity: await fixture.emailToIdentity(CURRENT_USER_EMAIL),
    });

    const result = await fixture.engine.useCases.getConfigProposal(GLOBAL_CONTEXT, {
      projectId: fixture.projectId,
      proposalId: configProposalId,
      identity: await fixture.emailToIdentity(CURRENT_USER_EMAIL),
    });

    expect(result.proposal.reviewerId).toBe(1); // CURRENT_USER_ID
    expect(result.proposal.reviewerEmail).toBe(CURRENT_USER_EMAIL);
  });

  it('should include config name in response', async () => {
    const {configId} = await fixture.createConfig({
      overrides: [],
      name: 'my_special_config',
      value: asConfigValue({enabled: false}),
      schema: null,
      description: 'Original description',
      identity: await fixture.emailToIdentity(CURRENT_USER_EMAIL),
      editorEmails: [],
      maintainerEmails: [CURRENT_USER_EMAIL, OTHER_USER_EMAIL],
      projectId: fixture.projectId,
    });

    const {configProposalId} = await fixture.engine.useCases.createConfigProposal(GLOBAL_CONTEXT, {
      projectId: fixture.projectId,
      baseVersion: 1,
      configId,
      description: 'New description',
      editorEmails: [],
      maintainerEmails: [CURRENT_USER_EMAIL, OTHER_USER_EMAIL],
      environmentVariants: [
        {
          environmentId: fixture.productionEnvironmentId,
          value: asConfigValue({enabled: false}),
          schema: null,
          overrides: [],
          useBaseSchema: false,
        },
        {
          environmentId: fixture.developmentEnvironmentId,
          value: asConfigValue({enabled: false}),
          schema: null,
          overrides: [],
          useBaseSchema: false,
        },
      ],
      identity: await fixture.emailToIdentity(OTHER_USER_EMAIL),
      proposedDelete: false,
      defaultVariant: {value: asConfigValue({x: 1}), schema: null, overrides: []},
      message: null,
    });

    const result = await fixture.engine.useCases.getConfigProposal(GLOBAL_CONTEXT, {
      projectId: fixture.projectId,
      proposalId: configProposalId,
      identity: await fixture.emailToIdentity(CURRENT_USER_EMAIL),
    });

    expect(result.proposal.configName).toBe('my_special_config');
  });

  it('should throw BadRequestError for non-existent proposal', async () => {
    const nonExistentProposalId = createUuidV4();

    await expect(
      fixture.engine.useCases.getConfigProposal(GLOBAL_CONTEXT, {
        projectId: fixture.projectId,
        proposalId: nonExistentProposalId,
        identity: await fixture.emailToIdentity(CURRENT_USER_EMAIL),
      }),
    ).rejects.toThrow(BadRequestError);
  });

  it('should prevent non-members from viewing proposals', async () => {
    const {configId} = await fixture.createConfig({
      overrides: [],
      name: 'get_proposal_any_user',
      value: asConfigValue({enabled: false}),
      schema: null,
      description: 'Original description',
      identity: await fixture.emailToIdentity(CURRENT_USER_EMAIL),
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
          value: asConfigValue({enabled: false}),
          schema: null,
          overrides: [],
          useBaseSchema: false,
        },
        {
          environmentId: fixture.developmentEnvironmentId,
          value: asConfigValue({enabled: false}),
          schema: null,
          overrides: [],
          useBaseSchema: false,
        },
      ],
      identity: await fixture.emailToIdentity(OTHER_USER_EMAIL),
      proposedDelete: false,
      defaultVariant: {value: asConfigValue({x: 1}), schema: null, overrides: []},
      message: null,
    });

    // THIRD_USER (not a project or org member) should NOT be able to view the proposal
    await expect(
      fixture.engine.useCases.getConfigProposal(GLOBAL_CONTEXT, {
        projectId: fixture.projectId,
        proposalId: configProposalId,
        identity: await fixture.emailToIdentity(NON_MEMBER_USER_EMAIL),
      }),
    ).rejects.toThrow('User does not have permission to view this project');
  });

  it('should return correct base config version', async () => {
    const {configId} = await fixture.createConfig({
      overrides: [],
      name: 'get_proposal_version',
      value: asConfigValue({enabled: false}),
      schema: null,
      description: 'Original description',
      identity: await fixture.emailToIdentity(CURRENT_USER_EMAIL),
      editorEmails: [],
      maintainerEmails: [CURRENT_USER_EMAIL, OTHER_USER_EMAIL],
      projectId: fixture.projectId,
    });

    // Create and approve first proposal (version becomes 2)
    const {configProposalId: firstProposalId} = await fixture.engine.useCases.createConfigProposal(
      GLOBAL_CONTEXT,
      {
        projectId: fixture.projectId,
        baseVersion: 1,
        configId,
        description: 'Version 2 description',
        editorEmails: [],
        maintainerEmails: [CURRENT_USER_EMAIL, OTHER_USER_EMAIL],
        environmentVariants: [
          {
            environmentId: fixture.productionEnvironmentId,
            value: asConfigValue({enabled: false}),
            schema: null,
            overrides: [],
            useBaseSchema: false,
          },
          {
            environmentId: fixture.developmentEnvironmentId,
            value: asConfigValue({enabled: false}),
            schema: null,
            overrides: [],
            useBaseSchema: false,
          },
        ],
        identity: await fixture.emailToIdentity(OTHER_USER_EMAIL),
        proposedDelete: false,
        defaultVariant: {value: asConfigValue({x: 1}), schema: null, overrides: []},
        message: null,
      },
    );

    await fixture.engine.useCases.approveConfigProposal(GLOBAL_CONTEXT, {
      projectId: fixture.projectId,
      proposalId: firstProposalId,
      identity: await fixture.emailToIdentity(CURRENT_USER_EMAIL),
    });

    // Create second proposal (should have baseConfigVersion = 2)
    const {configProposalId: secondProposalId} = await fixture.engine.useCases.createConfigProposal(
      GLOBAL_CONTEXT,
      {
        projectId: fixture.projectId,
        baseVersion: 2,
        configId,
        description: 'Version 3 description',
        editorEmails: [],
        maintainerEmails: [CURRENT_USER_EMAIL, OTHER_USER_EMAIL],
        environmentVariants: [
          {
            environmentId: fixture.productionEnvironmentId,
            value: asConfigValue({enabled: false}),
            schema: null,
            overrides: [],
            useBaseSchema: false,
          },
          {
            environmentId: fixture.developmentEnvironmentId,
            value: asConfigValue({enabled: false}),
            schema: null,
            overrides: [],
            useBaseSchema: false,
          },
        ],
        identity: await fixture.emailToIdentity(OTHER_USER_EMAIL),
        proposedDelete: false,
        defaultVariant: {value: asConfigValue({x: 1}), schema: null, overrides: []},
        message: null,
      },
    );

    const result = await fixture.engine.useCases.getConfigProposal(GLOBAL_CONTEXT, {
      projectId: fixture.projectId,
      proposalId: secondProposalId,
      identity: await fixture.emailToIdentity(CURRENT_USER_EMAIL),
    });

    expect(result.proposal.baseConfigVersion).toBe(2);
  });

  it('should handle proposal with null authorId', async () => {
    const {configId} = await fixture.createConfig({
      overrides: [],
      name: 'get_proposal_null_author',
      value: asConfigValue({enabled: false}),
      schema: null,
      description: 'Original description',
      identity: await fixture.emailToIdentity(CURRENT_USER_EMAIL),
      editorEmails: [],
      maintainerEmails: [CURRENT_USER_EMAIL, OTHER_USER_EMAIL],
      projectId: fixture.projectId,
    });

    const {configProposalId} = await fixture.engine.useCases.createConfigProposal(GLOBAL_CONTEXT, {
      projectId: fixture.projectId,
      baseVersion: 1,
      configId,
      description: 'New description',
      editorEmails: [],
      maintainerEmails: [CURRENT_USER_EMAIL, OTHER_USER_EMAIL],
      environmentVariants: [
        {
          environmentId: fixture.productionEnvironmentId,
          value: asConfigValue({enabled: false}),
          schema: null,
          overrides: [],
          useBaseSchema: false,
        },
        {
          environmentId: fixture.developmentEnvironmentId,
          value: asConfigValue({enabled: false}),
          schema: null,
          overrides: [],
          useBaseSchema: false,
        },
      ],
      identity: await fixture.emailToIdentity(OTHER_USER_EMAIL),
      proposedDelete: false,
      defaultVariant: {value: asConfigValue({x: 1}), schema: null, overrides: []},
      message: null,
    });

    // Manually set authorId to null (simulating deleted user)
    const connection = await fixture.engine.testing.pool.connect();
    try {
      await connection.query('UPDATE config_proposals SET author_id = NULL WHERE id = $1', [
        configProposalId,
      ]);
    } finally {
      connection.release();
    }

    const result = await fixture.engine.useCases.getConfigProposal(GLOBAL_CONTEXT, {
      projectId: fixture.projectId,
      proposalId: configProposalId,
      identity: await fixture.emailToIdentity(CURRENT_USER_EMAIL),
    });

    expect(result.proposal.authorId).toBeNull();
    expect(result.proposal.authorEmail).toBeNull();
  });

  it('should return base members from original snapshot', async () => {
    // Create a config with initial members
    const {configId} = await fixture.createConfig({
      overrides: [],
      name: 'base_members_test',
      value: asConfigValue({count: 1}),
      schema: null,
      description: 'Test',
      identity: await fixture.emailToIdentity(CURRENT_USER_EMAIL),
      editorEmails: [OTHER_USER_EMAIL],
      maintainerEmails: [CURRENT_USER_EMAIL],
      projectId: fixture.projectId,
    });

    // Create a proposal based on version 1
    const {configProposalId} = await fixture.engine.useCases.createConfigProposal(GLOBAL_CONTEXT, {
      projectId: fixture.projectId,
      baseVersion: 1,
      configId,
      description: 'New description',
      editorEmails: [OTHER_USER_EMAIL],
      maintainerEmails: [CURRENT_USER_EMAIL],
      environmentVariants: [
        {
          environmentId: fixture.productionEnvironmentId,
          value: asConfigValue({count: 1}),
          schema: null,
          overrides: [],
          useBaseSchema: false,
        },
        {
          environmentId: fixture.developmentEnvironmentId,
          value: asConfigValue({count: 1}),
          schema: null,
          overrides: [],
          useBaseSchema: false,
        },
      ],
      identity: await fixture.emailToIdentity(OTHER_USER_EMAIL),
      proposedDelete: false,
      defaultVariant: {value: asConfigValue({x: 1}), schema: null, overrides: []},
      message: null,
    });

    // Now modify the config's members (this will create version 2)
    await fixture.engine.useCases.updateConfig(GLOBAL_CONTEXT, {
      projectId: fixture.projectId,
      configName: 'base_members_test',
      description: 'Test',
      editors: [THIRD_USER_EMAIL], // THIRD_USER instead of OTHER_USER
      maintainers: [CURRENT_USER_EMAIL],
      base: {value: asConfigValue({count: 1}), schema: null, overrides: []},
      environments: [
        {
          environmentId: fixture.productionEnvironmentId,
          value: asConfigValue({count: 1}),
          schema: null,
          overrides: [],
          useBaseSchema: false,
        },
        {
          environmentId: fixture.developmentEnvironmentId,
          value: asConfigValue({count: 1}),
          schema: null,
          overrides: [],
          useBaseSchema: false,
        },
      ],
      identity: await fixture.emailToIdentity(CURRENT_USER_EMAIL),
      prevVersion: 1,
    });

    // Get the proposal - it should show base members from the original snapshot
    const result = await fixture.engine.useCases.getConfigProposal(GLOBAL_CONTEXT, {
      projectId: fixture.projectId,
      proposalId: configProposalId,
      identity: await fixture.emailToIdentity(CURRENT_USER_EMAIL),
    });

    // Base members should be from the original snapshot
    const baseMaintainerEmails = result.proposal.base.members
      .filter(m => m.role === 'maintainer')
      .map(m => m.email);
    const baseEditorEmails = result.proposal.base.members
      .filter(m => m.role === 'editor')
      .map(m => m.email);
    expect(baseMaintainerEmails).toEqual([CURRENT_USER_EMAIL]);
    expect(baseEditorEmails).toEqual([OTHER_USER_EMAIL]);
  });

  it('should handle member changes in proposal diff correctly', async () => {
    // Create config with initial members
    const {configId} = await fixture.createConfig({
      overrides: [],
      name: 'member_diff_test',
      value: asConfigValue({x: 1}),
      schema: null,
      description: 'Test',
      identity: await fixture.emailToIdentity(CURRENT_USER_EMAIL),
      editorEmails: [OTHER_USER_EMAIL],
      maintainerEmails: [CURRENT_USER_EMAIL],
      projectId: fixture.projectId,
    });

    // Create a proposal to change members
    const {configProposalId} = await fixture.engine.useCases.createConfigProposal(GLOBAL_CONTEXT, {
      projectId: fixture.projectId,
      baseVersion: 1,
      configId,
      description: 'Test',
      editorEmails: [THIRD_USER_EMAIL], // Replace OTHER_USER with THIRD_USER
      maintainerEmails: [CURRENT_USER_EMAIL],
      environmentVariants: [
        {
          environmentId: fixture.productionEnvironmentId,
          value: asConfigValue({count: 1}),
          schema: null,
          overrides: [],
          useBaseSchema: false,
        },
        {
          environmentId: fixture.developmentEnvironmentId,
          value: asConfigValue({count: 1}),
          schema: null,
          overrides: [],
          useBaseSchema: false,
        },
      ],
      identity: await fixture.emailToIdentity(OTHER_USER_EMAIL),
      proposedDelete: false,
      defaultVariant: {value: asConfigValue({x: 1}), schema: null, overrides: []},
      message: null,
    });

    const result = await fixture.engine.useCases.getConfigProposal(GLOBAL_CONTEXT, {
      projectId: fixture.projectId,
      proposalId: configProposalId,
      identity: await fixture.emailToIdentity(CURRENT_USER_EMAIL),
    });

    // Verify base members match the original config
    const baseMaintainerEmails = result.proposal.base.members
      .filter(m => m.role === 'maintainer')
      .map(m => m.email);
    const baseEditorEmails = result.proposal.base.members
      .filter(m => m.role === 'editor')
      .map(m => m.email);
    expect(baseMaintainerEmails).toEqual([CURRENT_USER_EMAIL]);
    expect(baseEditorEmails).toEqual([OTHER_USER_EMAIL]);

    // Verify the proposed members (order doesn't matter)
    expect(result.proposal.proposed.members).toEqual(
      expect.arrayContaining([
        {email: CURRENT_USER_EMAIL, role: 'maintainer'},
        {email: THIRD_USER_EMAIL, role: 'editor'},
      ]),
    );
    expect(result.proposal.proposed.members).toHaveLength(2);
  });

  it('should return empty proposalsRejectedByThisApproval for pending proposal', async () => {
    const {configId} = await fixture.createConfig({
      overrides: [],
      name: 'pending_rejected_list',
      value: asConfigValue({enabled: false}),
      schema: null,
      description: 'Original description',
      identity: await fixture.emailToIdentity(CURRENT_USER_EMAIL),
      editorEmails: [],
      maintainerEmails: [CURRENT_USER_EMAIL, OTHER_USER_EMAIL],
      projectId: fixture.projectId,
    });

    const {configProposalId} = await fixture.engine.useCases.createConfigProposal(GLOBAL_CONTEXT, {
      projectId: fixture.projectId,
      baseVersion: 1,
      configId,
      description: 'New description',
      editorEmails: [],
      maintainerEmails: [CURRENT_USER_EMAIL, OTHER_USER_EMAIL],
      environmentVariants: [
        {
          environmentId: fixture.productionEnvironmentId,
          value: asConfigValue({enabled: false}),
          schema: null,
          overrides: [],
          useBaseSchema: false,
        },
        {
          environmentId: fixture.developmentEnvironmentId,
          value: asConfigValue({enabled: false}),
          schema: null,
          overrides: [],
          useBaseSchema: false,
        },
      ],
      identity: await fixture.emailToIdentity(OTHER_USER_EMAIL),
      proposedDelete: false,
      defaultVariant: {value: asConfigValue({x: 1}), schema: null, overrides: []},
      message: null,
    });

    const result = await fixture.engine.useCases.getConfigProposal(GLOBAL_CONTEXT, {
      projectId: fixture.projectId,
      proposalId: configProposalId,
      identity: await fixture.emailToIdentity(CURRENT_USER_EMAIL),
    });

    expect(result.proposalsRejectedByThisApproval).toEqual([]);
  });

  it('should return empty proposalsRejectedByThisApproval for rejected proposal', async () => {
    const {configId} = await fixture.createConfig({
      overrides: [],
      name: 'rejected_rejected_list',
      value: asConfigValue({enabled: false}),
      schema: null,
      description: 'Original description',
      identity: await fixture.emailToIdentity(CURRENT_USER_EMAIL),
      editorEmails: [],
      maintainerEmails: [CURRENT_USER_EMAIL, OTHER_USER_EMAIL],
      projectId: fixture.projectId,
    });

    const {configProposalId} = await fixture.engine.useCases.createConfigProposal(GLOBAL_CONTEXT, {
      projectId: fixture.projectId,
      baseVersion: 1,
      configId,
      description: 'New description',
      editorEmails: [],
      maintainerEmails: [CURRENT_USER_EMAIL, OTHER_USER_EMAIL],
      environmentVariants: [
        {
          environmentId: fixture.productionEnvironmentId,
          value: asConfigValue({enabled: false}),
          schema: null,
          overrides: [],
          useBaseSchema: false,
        },
        {
          environmentId: fixture.developmentEnvironmentId,
          value: asConfigValue({enabled: false}),
          schema: null,
          overrides: [],
          useBaseSchema: false,
        },
      ],
      identity: await fixture.emailToIdentity(OTHER_USER_EMAIL),
      proposedDelete: false,
      defaultVariant: {value: asConfigValue({x: 1}), schema: null, overrides: []},
      message: null,
    });

    await fixture.engine.useCases.rejectConfigProposal(GLOBAL_CONTEXT, {
      proposalId: configProposalId,
      identity: await fixture.emailToIdentity(CURRENT_USER_EMAIL),
      projectId: fixture.projectId,
    });

    const result = await fixture.engine.useCases.getConfigProposal(GLOBAL_CONTEXT, {
      projectId: fixture.projectId,
      proposalId: configProposalId,
      identity: await fixture.emailToIdentity(CURRENT_USER_EMAIL),
    });

    expect(result.proposalsRejectedByThisApproval).toEqual([]);
  });

  it('should return proposalsRejectedByThisApproval when proposal is approved', async () => {
    const {configId} = await fixture.createConfig({
      overrides: [],
      name: 'approved_with_rejected',
      value: asConfigValue({enabled: false}),
      schema: null,
      description: 'Original description',
      identity: await fixture.emailToIdentity(CURRENT_USER_EMAIL),
      editorEmails: [],
      maintainerEmails: [CURRENT_USER_EMAIL, OTHER_USER_EMAIL, THIRD_USER_EMAIL],
      projectId: fixture.projectId,
    });

    // Create three proposals
    const {configProposalId: proposal1Id} = await fixture.engine.useCases.createConfigProposal(
      GLOBAL_CONTEXT,
      {
        projectId: fixture.projectId,
        baseVersion: 1,
        configId,
        description: 'First description',
        editorEmails: [],
        maintainerEmails: [CURRENT_USER_EMAIL, OTHER_USER_EMAIL, THIRD_USER_EMAIL],
        environmentVariants: [
          {
            environmentId: fixture.productionEnvironmentId,
            value: asConfigValue({enabled: false}),
            schema: null,
            overrides: [],
            useBaseSchema: false,
          },
          {
            environmentId: fixture.developmentEnvironmentId,
            value: asConfigValue({enabled: false}),
            schema: null,
            overrides: [],
            useBaseSchema: false,
          },
        ],
        identity: await fixture.emailToIdentity(OTHER_USER_EMAIL),
        proposedDelete: false,
        defaultVariant: {value: asConfigValue({x: 1}), schema: null, overrides: []},
        message: null,
      },
    );

    const {configProposalId: proposal2Id} = await fixture.engine.useCases.createConfigProposal(
      GLOBAL_CONTEXT,
      {
        projectId: fixture.projectId,
        baseVersion: 1,
        configId,
        description: 'Second description',
        editorEmails: [],
        maintainerEmails: [CURRENT_USER_EMAIL, OTHER_USER_EMAIL, THIRD_USER_EMAIL],
        environmentVariants: [
          {
            environmentId: fixture.productionEnvironmentId,
            value: asConfigValue({enabled: false}),
            schema: null,
            overrides: [],
            useBaseSchema: false,
          },
          {
            environmentId: fixture.developmentEnvironmentId,
            value: asConfigValue({enabled: false}),
            schema: null,
            overrides: [],
            useBaseSchema: false,
          },
        ],
        identity: await fixture.emailToIdentity(THIRD_USER_EMAIL),
        proposedDelete: false,
        defaultVariant: {value: asConfigValue({x: 1}), schema: null, overrides: []},
        message: null,
      },
    );

    const {configProposalId: proposal3Id} = await fixture.engine.useCases.createConfigProposal(
      GLOBAL_CONTEXT,
      {
        projectId: fixture.projectId,
        baseVersion: 1,
        configId,
        description: 'Third description',
        editorEmails: [],
        maintainerEmails: [CURRENT_USER_EMAIL, OTHER_USER_EMAIL, THIRD_USER_EMAIL],
        environmentVariants: [
          {
            environmentId: fixture.productionEnvironmentId,
            value: asConfigValue({enabled: false}),
            schema: null,
            overrides: [],
            useBaseSchema: false,
          },
          {
            environmentId: fixture.developmentEnvironmentId,
            value: asConfigValue({enabled: false}),
            schema: null,
            overrides: [],
            useBaseSchema: false,
          },
        ],
        identity: await fixture.emailToIdentity(CURRENT_USER_EMAIL),
        proposedDelete: false,
        defaultVariant: {value: asConfigValue({x: 1}), schema: null, overrides: []},
        message: null,
      },
    );

    // Approve proposal 2 (which should reject proposals 1 and 3)
    await fixture.engine.useCases.approveConfigProposal(GLOBAL_CONTEXT, {
      projectId: fixture.projectId,
      proposalId: proposal2Id,
      identity: await fixture.emailToIdentity(CURRENT_USER_EMAIL),
    });

    // Get the approved proposal
    const result = await fixture.engine.useCases.getConfigProposal(GLOBAL_CONTEXT, {
      projectId: fixture.projectId,
      proposalId: proposal2Id,
      identity: await fixture.emailToIdentity(CURRENT_USER_EMAIL),
    });

    // Should include the two rejected proposals
    expect(result.proposalsRejectedByThisApproval).toHaveLength(2);
    expect(result.proposalsRejectedByThisApproval).toEqual(
      expect.arrayContaining([
        {id: proposal1Id, authorEmail: OTHER_USER_EMAIL},
        {id: proposal3Id, authorEmail: CURRENT_USER_EMAIL},
      ]),
    );
  });

  it('should return proposalsRejectedByThisApproval with null authorEmail when author was deleted', async () => {
    const {configId} = await fixture.createConfig({
      overrides: [],
      name: 'approved_with_null_author',
      value: asConfigValue({enabled: false}),
      schema: null,
      description: 'Original description',
      identity: await fixture.emailToIdentity(CURRENT_USER_EMAIL),
      editorEmails: [],
      maintainerEmails: [CURRENT_USER_EMAIL, OTHER_USER_EMAIL, THIRD_USER_EMAIL],
      projectId: fixture.projectId,
    });

    // Create two proposals
    const {configProposalId: proposal1Id} = await fixture.engine.useCases.createConfigProposal(
      GLOBAL_CONTEXT,
      {
        projectId: fixture.projectId,
        baseVersion: 1,
        configId,
        description: 'First description',
        editorEmails: [],
        maintainerEmails: [CURRENT_USER_EMAIL, OTHER_USER_EMAIL, THIRD_USER_EMAIL],
        environmentVariants: [
          {
            environmentId: fixture.productionEnvironmentId,
            value: asConfigValue({enabled: false}),
            schema: null,
            overrides: [],
            useBaseSchema: false,
          },
          {
            environmentId: fixture.developmentEnvironmentId,
            value: asConfigValue({enabled: false}),
            schema: null,
            overrides: [],
            useBaseSchema: false,
          },
        ],
        identity: await fixture.emailToIdentity(OTHER_USER_EMAIL),
        proposedDelete: false,
        defaultVariant: {value: asConfigValue({x: 1}), schema: null, overrides: []},
        message: null,
      },
    );

    const {configProposalId: proposal2Id} = await fixture.engine.useCases.createConfigProposal(
      GLOBAL_CONTEXT,
      {
        projectId: fixture.projectId,
        baseVersion: 1,
        configId,
        description: 'Second description',
        editorEmails: [],
        maintainerEmails: [CURRENT_USER_EMAIL, OTHER_USER_EMAIL, THIRD_USER_EMAIL],
        environmentVariants: [
          {
            environmentId: fixture.productionEnvironmentId,
            value: asConfigValue({enabled: false}),
            schema: null,
            overrides: [],
            useBaseSchema: false,
          },
          {
            environmentId: fixture.developmentEnvironmentId,
            value: asConfigValue({enabled: false}),
            schema: null,
            overrides: [],
            useBaseSchema: false,
          },
        ],
        identity: await fixture.emailToIdentity(THIRD_USER_EMAIL),
        proposedDelete: false,
        defaultVariant: {value: asConfigValue({x: 1}), schema: null, overrides: []},
        message: null,
      },
    );

    // Manually set proposal1's authorId to null (simulating deleted user)
    const connection = await fixture.engine.testing.pool.connect();
    try {
      await connection.query('UPDATE config_proposals SET author_id = NULL WHERE id = $1', [
        proposal1Id,
      ]);
    } finally {
      connection.release();
    }

    // Approve proposal 2 (which should reject proposal 1)
    await fixture.engine.useCases.approveConfigProposal(GLOBAL_CONTEXT, {
      projectId: fixture.projectId,
      proposalId: proposal2Id,
      identity: await fixture.emailToIdentity(CURRENT_USER_EMAIL),
    });

    // Get the approved proposal
    const result = await fixture.engine.useCases.getConfigProposal(GLOBAL_CONTEXT, {
      projectId: fixture.projectId,
      proposalId: proposal2Id,
      identity: await fixture.emailToIdentity(CURRENT_USER_EMAIL),
    });

    // Should include the rejected proposal with null authorEmail
    expect(result.proposalsRejectedByThisApproval).toHaveLength(1);
    expect(result.proposalsRejectedByThisApproval[0]).toEqual({
      id: proposal1Id,
      authorEmail: null,
    });
  });

  it('should return empty proposalsRejectedByThisApproval when no other proposals were rejected', async () => {
    const {configId} = await fixture.createConfig({
      overrides: [],
      name: 'approved_no_others',
      value: asConfigValue({enabled: false}),
      schema: null,
      description: 'Original description',
      identity: await fixture.emailToIdentity(CURRENT_USER_EMAIL),
      editorEmails: [],
      maintainerEmails: [CURRENT_USER_EMAIL, OTHER_USER_EMAIL],
      projectId: fixture.projectId,
    });

    // Create only one proposal
    const {configProposalId} = await fixture.engine.useCases.createConfigProposal(GLOBAL_CONTEXT, {
      projectId: fixture.projectId,
      baseVersion: 1,
      configId,
      description: 'New description',
      editorEmails: [],
      maintainerEmails: [CURRENT_USER_EMAIL, OTHER_USER_EMAIL],
      environmentVariants: [
        {
          environmentId: fixture.productionEnvironmentId,
          value: asConfigValue({enabled: false}),
          schema: null,
          overrides: [],
          useBaseSchema: false,
        },
        {
          environmentId: fixture.developmentEnvironmentId,
          value: asConfigValue({enabled: false}),
          schema: null,
          overrides: [],
          useBaseSchema: false,
        },
      ],
      identity: await fixture.emailToIdentity(OTHER_USER_EMAIL),
      proposedDelete: false,
      defaultVariant: {value: asConfigValue({x: 1}), schema: null, overrides: []},
      message: null,
    });

    // Approve it
    await fixture.engine.useCases.approveConfigProposal(GLOBAL_CONTEXT, {
      projectId: fixture.projectId,
      proposalId: configProposalId,
      identity: await fixture.emailToIdentity(CURRENT_USER_EMAIL),
    });

    // Get the approved proposal
    const result = await fixture.engine.useCases.getConfigProposal(GLOBAL_CONTEXT, {
      projectId: fixture.projectId,
      proposalId: configProposalId,
      identity: await fixture.emailToIdentity(CURRENT_USER_EMAIL),
    });

    // Should have no rejected proposals
    expect(result.proposalsRejectedByThisApproval).toEqual([]);
  });

  it('should get a proposal with variant changes', async () => {
    const {configId, configVariantIds} = await fixture.createConfig({
      overrides: [],
      name: 'get_proposal_with_variants',
      value: asConfigValue({enabled: true}),
      schema: asConfigSchema({type: 'object', properties: {enabled: {type: 'boolean'}}}),
      description: 'Variant proposal test',
      identity: await fixture.emailToIdentity(CURRENT_USER_EMAIL),
      editorEmails: [],
      maintainerEmails: [CURRENT_USER_EMAIL, OTHER_USER_EMAIL],
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
      description: 'Variant proposal test',
      editorEmails: [],
      maintainerEmails: [CURRENT_USER_EMAIL, OTHER_USER_EMAIL],
      environmentVariants: [
        {
          environmentId: fixture.productionEnvironmentId,
          value: asConfigValue({enabled: false}),
          schema: asConfigSchema({type: 'object', properties: {enabled: {type: 'boolean'}}}),
          overrides: [],
          useBaseSchema: false,
        },
        {
          environmentId: fixture.developmentEnvironmentId,
          value: asConfigValue({enabled: true}),
          schema: asConfigSchema({type: 'object', properties: {enabled: {type: 'boolean'}}}),
          useBaseSchema: false,
          overrides: [],
        },
      ],
      identity: await fixture.emailToIdentity(OTHER_USER_EMAIL),
      proposedDelete: false,
      defaultVariant: {value: asConfigValue({x: 1}), schema: null, overrides: []},
      message: null,
    });

    const result = await fixture.engine.useCases.getConfigProposal(GLOBAL_CONTEXT, {
      projectId: fixture.projectId,
      proposalId: configProposalId,
      identity: await fixture.emailToIdentity(CURRENT_USER_EMAIL),
    });

    expect(result.proposal.proposed.variants).toHaveLength(2);
    const prodVariant = result.proposal.proposed.variants.find(
      (v: {environmentName: string}) => v.environmentName === 'Production',
    );
    expect(prodVariant).toMatchObject({
      environmentName: 'Production',
      value: asConfigValue({enabled: false}),
    });
  });

  it('should indicate maintainers as approvers for schema changes in variants', async () => {
    const {configId, configVariantIds} = await fixture.createConfig({
      overrides: [],
      name: 'get_proposal_schema_change',
      value: asConfigValue({enabled: true}),
      schema: asConfigSchema({type: 'object', properties: {enabled: {type: 'boolean'}}}),
      description: 'Schema change test',
      identity: await fixture.emailToIdentity(CURRENT_USER_EMAIL),
      editorEmails: [OTHER_USER_EMAIL],
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
      description: 'Schema change test',
      editorEmails: [OTHER_USER_EMAIL],
      maintainerEmails: [CURRENT_USER_EMAIL],
      environmentVariants: [
        {
          environmentId: fixture.productionEnvironmentId,
          value: asConfigValue({enabled: true}),
          schema: asConfigSchema({
            type: 'object',
            properties: {enabled: {type: 'boolean'}, count: {type: 'number'}},
          }),
          useBaseSchema: false,
          overrides: [],
        },
        {
          environmentId: fixture.developmentEnvironmentId,
          value: asConfigValue({enabled: true}),
          schema: asConfigSchema({type: 'object', properties: {enabled: {type: 'boolean'}}}),
          useBaseSchema: false,
          overrides: [],
        },
      ],
      proposedDelete: false,
      defaultVariant: {value: asConfigValue({x: 1}), schema: null, overrides: []},
      message: null,
      identity: await fixture.emailToIdentity(OTHER_USER_EMAIL),
    });

    const result = await fixture.engine.useCases.getConfigProposal(GLOBAL_CONTEXT, {
      projectId: fixture.projectId,
      proposalId: configProposalId,
      identity: await fixture.emailToIdentity(CURRENT_USER_EMAIL),
    });

    expect(result.proposal.approverRole).toBe('maintainers');
    expect(result.proposal.approverReason).toBe('Schema changes require maintainer approval.');
  });
});
