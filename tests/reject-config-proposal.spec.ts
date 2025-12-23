import {GLOBAL_CONTEXT} from '@/engine/core/context';
import {BadRequestError, ForbiddenError} from '@/engine/core/errors';
import type {ConfigProposalRejectedAuditLogPayload} from '@/engine/core/stores/audit-log-store';
import {normalizeEmail} from '@/engine/core/utils';
import {createUuidV4} from '@/engine/core/uuid';
import {asConfigValue} from '@/engine/core/zod';
import {assert, beforeEach, describe, expect, it} from 'vitest';
import {emailToIdentity, useAppFixture} from './fixtures/app-fixture';

const CURRENT_USER_EMAIL = normalizeEmail('test@example.com');
const OTHER_USER_EMAIL = normalizeEmail('other@example.com');
const THIRD_USER_EMAIL = normalizeEmail('third@example.com');
const NON_PROJECT_MEMBER_EMAIL = normalizeEmail('non-project-member@example.com');

const OTHER_USER_ID = 2;
const THIRD_USER_ID = 3;
const NON_PROJECT_MEMBER_ID = 4;
describe('rejectConfigProposal', () => {
  const fixture = useAppFixture({authEmail: CURRENT_USER_EMAIL});

  beforeEach(async () => {
    const connection = await fixture.engine.testing.pool.connect();
    try {
      await connection.query(
        `INSERT INTO users(id, name, email, "emailVerified") VALUES ($1, 'Other', $2, NOW()), ($3, 'Third', $4, NOW()), ($5, 'Non-Project-Member', $6, NOW())`,
        [
          OTHER_USER_ID,
          OTHER_USER_EMAIL,
          THIRD_USER_ID,
          THIRD_USER_EMAIL,
          NON_PROJECT_MEMBER_ID,
          NON_PROJECT_MEMBER_EMAIL,
        ],
      );
    } finally {
      connection.release();
    }

    fixture.engine.testing.workspaceMembers.create([
      {
        workspaceId: fixture.workspaceId,
        email: OTHER_USER_EMAIL,
        role: 'member',
        createdAt: new Date(),
        updatedAt: new Date(),
      },
    ]);
    fixture.engine.testing.workspaceMembers.create([
      {
        workspaceId: fixture.workspaceId,
        email: THIRD_USER_EMAIL,
        role: 'member',
        createdAt: new Date(),
        updatedAt: new Date(),
      },
    ]);
  });

  it('should reject a proposal with description change', async () => {
    const {configId} = await fixture.createConfig({
      overrides: [],
      name: 'reject_description',
      value: {enabled: false},
      schema: null,
      description: 'Original description',
      identity: emailToIdentity(CURRENT_USER_EMAIL),
      editorEmails: [CURRENT_USER_EMAIL],
      maintainerEmails: [OTHER_USER_EMAIL],
      projectId: fixture.projectId,
    });

    const {configProposalId} = await fixture.engine.useCases.createConfigProposal(GLOBAL_CONTEXT, {
      projectId: fixture.projectId,
      baseVersion: 1,
      configId,
      description: 'Updated description',
      editorEmails: [CURRENT_USER_EMAIL],
      maintainerEmails: [OTHER_USER_EMAIL],
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
      identity: emailToIdentity(OTHER_USER_EMAIL),
      proposedDelete: false,
      defaultVariant: {value: asConfigValue({x: 1}), schema: null, overrides: []},
      message: null,
    });

    await fixture.engine.useCases.rejectConfigProposal(GLOBAL_CONTEXT, {
      projectId: fixture.projectId,
      proposalId: configProposalId,
      identity: emailToIdentity(CURRENT_USER_EMAIL),
    });

    // Verify proposal is rejected
    const proposal = await fixture.engine.testing.configProposals.getById({
      id: configProposalId,
      projectId: fixture.projectId,
    });
    assert(proposal, 'Proposal not found');
    expect(proposal.rejectedAt).toBeDefined();
    expect(proposal.approvedAt).toBeNull();
    expect(proposal.reviewerId).toBe(1); // CURRENT_USER_ID is 1
    expect(proposal.rejectionReason).toBe('rejected_explicitly');

    // Verify audit message includes proposed description
    const auditLogs = await fixture.engine.testing.auditLogs.list({
      lte: fixture.now,
      limit: 100,
      orderBy: 'created_at desc, id desc',
      projectId: fixture.projectId,
    });
    const rejectionMessage = auditLogs.find(
      msg =>
        msg.payload.type === 'config_proposal_rejected' &&
        msg.payload.proposalId === configProposalId,
    ) as {payload: ConfigProposalRejectedAuditLogPayload} | undefined;
    assert(rejectionMessage, 'Rejection message not found');
    expect(rejectionMessage.payload).toMatchObject({
      type: 'config_proposal_rejected',
      proposalId: configProposalId,
      configId,
      proposedDescription: 'Updated description',
    });
  });

  it('should reject a proposal with member changes', async () => {
    const {configId} = await fixture.createConfig({
      overrides: [],
      name: 'reject_members',
      value: {enabled: false},
      schema: null,
      description: 'Original description',
      identity: emailToIdentity(CURRENT_USER_EMAIL),
      editorEmails: [CURRENT_USER_EMAIL],
      maintainerEmails: [OTHER_USER_EMAIL],
      projectId: fixture.projectId,
    });

    const {configProposalId} = await fixture.engine.useCases.createConfigProposal(GLOBAL_CONTEXT, {
      projectId: fixture.projectId,
      baseVersion: 1,
      configId,
      description: 'Original description',
      editorEmails: [THIRD_USER_EMAIL],
      maintainerEmails: [OTHER_USER_EMAIL],
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
      identity: emailToIdentity(OTHER_USER_EMAIL),
      proposedDelete: false,
      defaultVariant: {value: asConfigValue({x: 1}), schema: null, overrides: []},
      message: null,
    });

    await fixture.engine.useCases.rejectConfigProposal(GLOBAL_CONTEXT, {
      projectId: fixture.projectId,
      proposalId: configProposalId,
      identity: emailToIdentity(CURRENT_USER_EMAIL),
    });

    // Verify proposal is rejected
    const proposal = await fixture.engine.testing.configProposals.getById({
      id: configProposalId,
      projectId: fixture.projectId,
    });
    assert(proposal);
    expect(proposal.rejectedAt).toBeDefined();
    expect(proposal.approvedAt).toBeNull();

    // Verify audit message includes proposed members
    const auditLogs = await fixture.engine.testing.auditLogs.list({
      lte: fixture.now,
      limit: 100,
      orderBy: 'created_at desc, id desc',
      projectId: fixture.projectId,
    });
    const rejectionMessage = auditLogs.find(
      msg =>
        msg.payload.type === 'config_proposal_rejected' &&
        msg.payload.proposalId === configProposalId,
    ) as {payload: ConfigProposalRejectedAuditLogPayload} | undefined;
    assert(rejectionMessage, 'Rejection message not found');
    expect(rejectionMessage.payload.proposedMembers).toBeDefined();
  });

  it('should reject a deletion proposal', async () => {
    const {configId} = await fixture.createConfig({
      overrides: [],
      name: 'reject_delete',
      value: asConfigValue({enabled: false}),
      schema: null,
      description: 'Original description',
      identity: emailToIdentity(CURRENT_USER_EMAIL),
      editorEmails: [CURRENT_USER_EMAIL],
      maintainerEmails: [OTHER_USER_EMAIL],
      projectId: fixture.projectId,
    });

    const {configProposalId} = await fixture.engine.useCases.createConfigProposal(GLOBAL_CONTEXT, {
      projectId: fixture.projectId,
      baseVersion: 1,
      configId,
      proposedDelete: true,
      identity: emailToIdentity(OTHER_USER_EMAIL),
      defaultVariant: {value: asConfigValue({x: 1}), schema: null, overrides: []},
      message: null,
      description: 'Original description',
      editorEmails: [CURRENT_USER_EMAIL],
      maintainerEmails: [OTHER_USER_EMAIL],
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
    });

    await fixture.engine.useCases.rejectConfigProposal(GLOBAL_CONTEXT, {
      projectId: fixture.projectId,
      proposalId: configProposalId,
      identity: emailToIdentity(CURRENT_USER_EMAIL),
    });

    // Verify proposal is rejected
    const proposal = await fixture.engine.testing.configProposals.getById({
      id: configProposalId,
      projectId: fixture.projectId,
    });
    assert(proposal);
    expect(proposal.rejectedAt).toBeDefined();
    expect(proposal.approvedAt).toBeNull();

    // Verify config still exists
    const config = await fixture.trpc.getConfig({
      name: 'reject_delete',
      projectId: fixture.projectId,
    });
    expect(config?.config).toBeDefined();
  });

  it('should reject a proposal with multiple changes (description + members)', async () => {
    const {configId} = await fixture.createConfig({
      overrides: [],
      name: 'reject_multiple',
      value: asConfigValue({enabled: false}),
      schema: null,
      description: 'Original description',
      identity: emailToIdentity(CURRENT_USER_EMAIL),
      editorEmails: [CURRENT_USER_EMAIL],
      maintainerEmails: [OTHER_USER_EMAIL],
      projectId: fixture.projectId,
    });

    const {configProposalId} = await fixture.engine.useCases.createConfigProposal(GLOBAL_CONTEXT, {
      projectId: fixture.projectId,
      baseVersion: 1,
      configId,
      description: 'Updated description',
      editorEmails: [THIRD_USER_EMAIL],
      maintainerEmails: [OTHER_USER_EMAIL],
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
      identity: emailToIdentity(OTHER_USER_EMAIL),
      proposedDelete: false,
      defaultVariant: {value: asConfigValue({x: 1}), schema: null, overrides: []},
      message: null,
    });

    await fixture.engine.useCases.rejectConfigProposal(GLOBAL_CONTEXT, {
      projectId: fixture.projectId,
      proposalId: configProposalId,
      identity: emailToIdentity(CURRENT_USER_EMAIL),
    });

    // Verify audit message includes all proposed changes
    const auditLogs = await fixture.engine.testing.auditLogs.list({
      lte: fixture.now,
      limit: 100,
      orderBy: 'created_at desc, id desc',
      projectId: fixture.projectId,
    });
    const rejectionMessage = auditLogs.find(
      msg =>
        msg.payload.type === 'config_proposal_rejected' &&
        msg.payload.proposalId === configProposalId,
    ) as {payload: ConfigProposalRejectedAuditLogPayload} | undefined;
    assert(rejectionMessage, 'Rejection message not found');
    expect(rejectionMessage.payload).toMatchObject({
      type: 'config_proposal_rejected',
      proposalId: configProposalId,
      configId,
      proposedDescription: 'Updated description',
    });
    expect(rejectionMessage.payload.proposedMembers).toBeDefined();
  });

  it('should set rejectedInFavorOfProposalId to undefined (explicit rejection)', async () => {
    const {configId} = await fixture.createConfig({
      overrides: [],
      name: 'reject_explicit',
      value: {enabled: false},
      schema: null,
      description: 'Original description',
      identity: emailToIdentity(CURRENT_USER_EMAIL),
      editorEmails: [CURRENT_USER_EMAIL],
      maintainerEmails: [OTHER_USER_EMAIL],
      projectId: fixture.projectId,
    });

    const {configProposalId} = await fixture.engine.useCases.createConfigProposal(GLOBAL_CONTEXT, {
      projectId: fixture.projectId,
      baseVersion: 1,
      configId,
      description: 'Updated description',
      editorEmails: [CURRENT_USER_EMAIL],
      maintainerEmails: [OTHER_USER_EMAIL],
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
      identity: emailToIdentity(OTHER_USER_EMAIL),
      proposedDelete: false,
      defaultVariant: {value: asConfigValue({x: 1}), schema: null, overrides: []},
      message: null,
    });

    await fixture.engine.useCases.rejectConfigProposal(GLOBAL_CONTEXT, {
      projectId: fixture.projectId,
      proposalId: configProposalId,
      identity: emailToIdentity(CURRENT_USER_EMAIL),
    });

    // Verify audit message has undefined rejectedInFavorOfProposalId (explicit rejection)
    const auditLogs = await fixture.engine.testing.auditLogs.list({
      lte: fixture.now,
      limit: 100,
      orderBy: 'created_at desc, id desc',
      projectId: fixture.projectId,
    });
    const rejectionMessage = auditLogs.find(
      msg =>
        msg.payload.type === 'config_proposal_rejected' &&
        msg.payload.proposalId === configProposalId,
    ) as {payload: ConfigProposalRejectedAuditLogPayload} | undefined;
    assert(rejectionMessage, 'Rejection message not found');
    expect(rejectionMessage.payload.rejectedInFavorOfProposalId).toBeUndefined();
  });

  it('should allow anyone to reject a proposal (no permission check)', async () => {
    // Create config with CURRENT_USER as editor, OTHER_USER as maintainer
    const {configId} = await fixture.createConfig({
      overrides: [],
      name: 'reject_no_permission',
      value: {enabled: false},
      schema: null,
      description: 'Original description',
      identity: emailToIdentity(CURRENT_USER_EMAIL),
      editorEmails: [CURRENT_USER_EMAIL],
      maintainerEmails: [OTHER_USER_EMAIL],
      projectId: fixture.projectId,
    });

    // Create proposal by THIRD_USER (who is not a member)
    const {configProposalId} = await fixture.engine.useCases.createConfigProposal(GLOBAL_CONTEXT, {
      projectId: fixture.projectId,
      baseVersion: 1,
      configId,
      description: 'Updated description',
      editorEmails: [CURRENT_USER_EMAIL],
      maintainerEmails: [OTHER_USER_EMAIL],
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
      identity: emailToIdentity(THIRD_USER_EMAIL),
      proposedDelete: false,
      defaultVariant: {value: asConfigValue({x: 1}), schema: null, overrides: []},
      message: null,
    });

    // THIRD_USER can reject their own proposal (no permission check)
    await fixture.engine.useCases.rejectConfigProposal(GLOBAL_CONTEXT, {
      projectId: fixture.projectId,
      proposalId: configProposalId,
      identity: emailToIdentity(THIRD_USER_EMAIL),
    });

    // Verify proposal is rejected
    const proposal = await fixture.engine.testing.configProposals.getById({
      id: configProposalId,
      projectId: fixture.projectId,
    });
    assert(proposal);
    expect(proposal.rejectedAt).toBeDefined();
  });

  it('should allow multiple users to reject different proposals', async () => {
    const {configId} = await fixture.createConfig({
      overrides: [],
      name: 'reject_multiple_users',
      value: {enabled: false},
      schema: null,
      description: 'Original description',
      identity: emailToIdentity(CURRENT_USER_EMAIL),
      editorEmails: [CURRENT_USER_EMAIL],
      maintainerEmails: [OTHER_USER_EMAIL, THIRD_USER_EMAIL],
      projectId: fixture.projectId,
    });

    // Create multiple proposals
    const {configProposalId: proposalId1} = await fixture.engine.useCases.createConfigProposal(
      GLOBAL_CONTEXT,
      {
        projectId: fixture.projectId,
        configId,
        baseVersion: 1,
        description: 'Description 1',
        editorEmails: [CURRENT_USER_EMAIL],
        maintainerEmails: [OTHER_USER_EMAIL, THIRD_USER_EMAIL],
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
        identity: emailToIdentity(OTHER_USER_EMAIL),
        proposedDelete: false,
        defaultVariant: {value: asConfigValue({x: 1}), schema: null, overrides: []},
        message: null,
      },
    );

    const {configProposalId: proposalId2} = await fixture.engine.useCases.createConfigProposal(
      GLOBAL_CONTEXT,
      {
        projectId: fixture.projectId,
        configId,
        baseVersion: 1,
        description: 'Description 2',
        editorEmails: [CURRENT_USER_EMAIL],
        maintainerEmails: [OTHER_USER_EMAIL, THIRD_USER_EMAIL],
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
        identity: emailToIdentity(THIRD_USER_EMAIL),
        proposedDelete: false,
        defaultVariant: {value: asConfigValue({x: 1}), schema: null, overrides: []},
        message: null,
      },
    );

    // Different users reject different proposals
    await fixture.engine.useCases.rejectConfigProposal(GLOBAL_CONTEXT, {
      projectId: fixture.projectId,
      proposalId: proposalId1,
      identity: emailToIdentity(CURRENT_USER_EMAIL),
    });

    await fixture.engine.useCases.rejectConfigProposal(GLOBAL_CONTEXT, {
      projectId: fixture.projectId,
      proposalId: proposalId2,
      identity: emailToIdentity(OTHER_USER_EMAIL),
    });

    // Verify both proposals are rejected
    const p1 = await fixture.engine.testing.configProposals.getById({
      id: proposalId1,
      projectId: fixture.projectId,
    });
    const p2 = await fixture.engine.testing.configProposals.getById({
      id: proposalId2,
      projectId: fixture.projectId,
    });
    assert(p1 && p2);
    expect(p1.rejectedAt).toBeDefined();
    expect(p2.rejectedAt).toBeDefined();
  });

  it('should throw BadRequestError when rejecting non-existent proposal', async () => {
    const nonExistentProposalId = createUuidV4();

    await expect(
      fixture.engine.useCases.rejectConfigProposal(GLOBAL_CONTEXT, {
        projectId: fixture.projectId,
        proposalId: nonExistentProposalId,
        identity: emailToIdentity(CURRENT_USER_EMAIL),
      }),
    ).rejects.toThrow(BadRequestError);
  });

  it('should throw BadRequestError when rejecting already rejected proposal', async () => {
    const {configId} = await fixture.createConfig({
      overrides: [],
      name: 'reject_already_rejected',
      value: asConfigValue({enabled: false}),
      schema: null,
      description: 'Original description',
      identity: emailToIdentity(CURRENT_USER_EMAIL),
      editorEmails: [CURRENT_USER_EMAIL],
      maintainerEmails: [OTHER_USER_EMAIL],
      projectId: fixture.projectId,
    });

    const {configProposalId} = await fixture.engine.useCases.createConfigProposal(GLOBAL_CONTEXT, {
      projectId: fixture.projectId,
      baseVersion: 1,
      configId,
      description: 'Updated description',
      editorEmails: [CURRENT_USER_EMAIL],
      maintainerEmails: [OTHER_USER_EMAIL],
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
      identity: emailToIdentity(OTHER_USER_EMAIL),
      proposedDelete: false,
      defaultVariant: {value: asConfigValue({x: 1}), schema: null, overrides: []},
      message: null,
    });

    // Reject proposal
    await fixture.engine.useCases.rejectConfigProposal(GLOBAL_CONTEXT, {
      projectId: fixture.projectId,
      proposalId: configProposalId,
      identity: emailToIdentity(CURRENT_USER_EMAIL),
    });

    // Try to reject again
    await expect(
      fixture.engine.useCases.rejectConfigProposal(GLOBAL_CONTEXT, {
        projectId: fixture.projectId,
        proposalId: configProposalId,
        identity: emailToIdentity(OTHER_USER_EMAIL),
      }),
    ).rejects.toThrow(BadRequestError);
  });

  it('should throw BadRequestError when rejecting already approved proposal', async () => {
    const {configId} = await fixture.createConfig({
      overrides: [],
      name: 'reject_already_approved',
      value: asConfigValue({enabled: false}),
      schema: null,
      description: 'Original description',
      identity: emailToIdentity(CURRENT_USER_EMAIL),
      editorEmails: [CURRENT_USER_EMAIL],
      maintainerEmails: [OTHER_USER_EMAIL],
      projectId: fixture.projectId,
    });

    const {configProposalId} = await fixture.engine.useCases.createConfigProposal(GLOBAL_CONTEXT, {
      projectId: fixture.projectId,
      baseVersion: 1,
      configId,
      description: 'Updated description',
      editorEmails: [CURRENT_USER_EMAIL],
      maintainerEmails: [OTHER_USER_EMAIL],
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
      identity: emailToIdentity(CURRENT_USER_EMAIL),
      proposedDelete: false,
      defaultVariant: {value: asConfigValue({x: 1}), schema: null, overrides: []},
      message: null,
    });

    // Approve proposal (OTHER_USER is maintainer, can approve description changes)
    await fixture.engine.useCases.approveConfigProposal(GLOBAL_CONTEXT, {
      projectId: fixture.projectId,
      proposalId: configProposalId,
      identity: emailToIdentity(OTHER_USER_EMAIL),
    });

    // Try to reject
    await expect(
      fixture.engine.useCases.rejectConfigProposal(GLOBAL_CONTEXT, {
        projectId: fixture.projectId,
        proposalId: configProposalId,
        identity: emailToIdentity(CURRENT_USER_EMAIL),
      }),
    ).rejects.toThrow(BadRequestError);
  });

  it('should set reviewerId when rejecting a proposal', async () => {
    const {configId} = await fixture.createConfig({
      overrides: [],
      name: 'reject_reviewer_id',
      value: asConfigValue({enabled: false}),
      schema: null,
      description: 'Original description',
      identity: emailToIdentity(CURRENT_USER_EMAIL),
      editorEmails: [CURRENT_USER_EMAIL],
      maintainerEmails: [OTHER_USER_EMAIL],
      projectId: fixture.projectId,
    });

    const {configProposalId} = await fixture.engine.useCases.createConfigProposal(GLOBAL_CONTEXT, {
      projectId: fixture.projectId,
      baseVersion: 1,
      configId,
      description: 'Updated description',
      editorEmails: [CURRENT_USER_EMAIL],
      maintainerEmails: [OTHER_USER_EMAIL],
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
      identity: emailToIdentity(OTHER_USER_EMAIL),
      proposedDelete: false,
      defaultVariant: {value: asConfigValue({x: 1}), schema: null, overrides: []},
      message: null,
    });

    // Reject proposal
    await fixture.engine.useCases.rejectConfigProposal(GLOBAL_CONTEXT, {
      projectId: fixture.projectId,
      proposalId: configProposalId,
      identity: emailToIdentity(CURRENT_USER_EMAIL),
    });

    // Verify proposal has reviewerId
    const proposal = await fixture.engine.testing.configProposals.getById({
      id: configProposalId,
      projectId: fixture.projectId,
    });
    assert(proposal);
    expect(proposal.reviewerId).toBe(1); // CURRENT_USER_ID is 1
  });

  it('should not apply any changes to the config when rejecting', async () => {
    const {configId} = await fixture.createConfig({
      overrides: [],
      name: 'reject_no_changes',
      value: asConfigValue({enabled: false}),
      schema: null,
      description: 'Original description',
      identity: emailToIdentity(CURRENT_USER_EMAIL),
      editorEmails: [CURRENT_USER_EMAIL],
      maintainerEmails: [OTHER_USER_EMAIL],
      projectId: fixture.projectId,
    });

    const {config: originalConfig} = await fixture.trpc.getConfig({
      name: 'reject_no_changes',
      projectId: fixture.projectId,
    });
    const originalVersion = originalConfig?.config.version;

    const {configProposalId} = await fixture.engine.useCases.createConfigProposal(GLOBAL_CONTEXT, {
      projectId: fixture.projectId,
      baseVersion: 1,
      configId,
      description: 'New description',
      editorEmails: [CURRENT_USER_EMAIL],
      maintainerEmails: [OTHER_USER_EMAIL],
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
      identity: emailToIdentity(OTHER_USER_EMAIL),
      proposedDelete: false,
      defaultVariant: {value: asConfigValue({x: 1}), schema: null, overrides: []},
      message: null,
    });

    // Reject proposal
    await fixture.engine.useCases.rejectConfigProposal(GLOBAL_CONTEXT, {
      projectId: fixture.projectId,
      proposalId: configProposalId,
      identity: emailToIdentity(CURRENT_USER_EMAIL),
    });

    // Verify config is unchanged
    const {config} = await fixture.trpc.getConfig({
      name: 'reject_no_changes',
      projectId: fixture.projectId,
    });
    expect(config?.config.description).toBe('Original description');
    expect(config?.config.version).toBe(originalVersion); // Version should not change
  });

  it("shouldn't allow creating config in a project that the user is not a member of", async () => {
    await expect(
      fixture.createConfig({
        projectId: fixture.projectId,
        overrides: [],
        name: 'non_project_member_config',
        value: asConfigValue({enabled: false}),
        schema: null,
        description: 'Original description',
        identity: emailToIdentity(NON_PROJECT_MEMBER_EMAIL),
        editorEmails: [],
        maintainerEmails: [],
      }),
    ).rejects.toThrow(ForbiddenError);
  });

  it('should record the correct user as the rejector in audit message', async () => {
    const {configId} = await fixture.createConfig({
      overrides: [],
      name: 'reject_correct_user',
      value: asConfigValue({enabled: false}),
      schema: null,
      description: 'Original description',
      identity: emailToIdentity(CURRENT_USER_EMAIL),
      editorEmails: [CURRENT_USER_EMAIL],
      maintainerEmails: [OTHER_USER_EMAIL],
      projectId: fixture.projectId,
    });

    // Create proposal by OTHER_USER
    const {configProposalId} = await fixture.engine.useCases.createConfigProposal(GLOBAL_CONTEXT, {
      projectId: fixture.projectId,
      baseVersion: 1,
      configId,
      description: 'Updated description',
      editorEmails: [CURRENT_USER_EMAIL],
      maintainerEmails: [OTHER_USER_EMAIL],
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
      identity: emailToIdentity(OTHER_USER_EMAIL),
      proposedDelete: false,
      defaultVariant: {value: asConfigValue({x: 1}), schema: null, overrides: []},
      message: null,
    });

    // Reject by CURRENT_USER
    await fixture.engine.useCases.rejectConfigProposal(GLOBAL_CONTEXT, {
      projectId: fixture.projectId,
      proposalId: configProposalId,
      identity: emailToIdentity(CURRENT_USER_EMAIL),
    });

    // Verify audit message has correct userId (rejector, not author)
    const auditLogs = await fixture.engine.testing.auditLogs.list({
      lte: fixture.now,
      limit: 100,
      orderBy: 'created_at desc, id desc',
      projectId: fixture.projectId,
    });
    const rejectionMessage = auditLogs.find(
      msg =>
        msg.payload.type === 'config_proposal_rejected' &&
        msg.payload.proposalId === configProposalId,
    ) as {payload: ConfigProposalRejectedAuditLogPayload; userId: number} | undefined;
    assert(rejectionMessage, 'Rejection message not found');
    expect(rejectionMessage.userId).toBe(1); // CURRENT_USER_ID is 1
  });
});
