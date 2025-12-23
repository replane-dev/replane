import {GLOBAL_CONTEXT} from '@/engine/core/context';
import {BadRequestError} from '@/engine/core/errors';
import type {ConfigProposalRejectedAuditLogPayload} from '@/engine/core/stores/audit-log-store';
import {normalizeEmail} from '@/engine/core/utils';
import {createUuidV4} from '@/engine/core/uuid';
import {asConfigSchema, asConfigValue} from '@/engine/core/zod';
import {assert, beforeEach, describe, expect, it} from 'vitest';
import {useAppFixture} from './fixtures/app-fixture';

const CURRENT_USER_EMAIL = normalizeEmail('test@example.com');
const OTHER_USER_EMAIL = normalizeEmail('other@example.com');
const THIRD_USER_EMAIL = normalizeEmail('third@example.com');

const OTHER_USER_ID = 2;
const THIRD_USER_ID = 3;

describe('rejectAllPendingConfigProposals', () => {
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

  it('should reject all pending proposals for a config', async () => {
    const {configId} = await fixture.createConfig({
      overrides: [],
      name: 'reject_all_test',
      value: {enabled: false},
      schema: null,
      description: 'Original description',
      identity: await fixture.emailToIdentity(CURRENT_USER_EMAIL),
      editorEmails: [],
      maintainerEmails: [CURRENT_USER_EMAIL, OTHER_USER_EMAIL, THIRD_USER_EMAIL],
      projectId: fixture.projectId,
    });

    // Create multiple config proposals (config-level: description and members)
    const {configProposalId: proposal1Id} = await fixture.engine.useCases.createConfigProposal(
      GLOBAL_CONTEXT,
      {
        projectId: fixture.projectId,
        baseVersion: 1,
        configId,
        description: 'Description 1',
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
        description: 'Description 2',
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
        description: 'Description 3',
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

    // Verify all proposals are pending
    const pendingBefore = await fixture.engine.testing.configProposals.getPendingProposals({
      configId,
    });
    expect(pendingBefore).toHaveLength(3);

    // Reject all pending proposals
    await fixture.engine.useCases.rejectAllPendingConfigProposals(GLOBAL_CONTEXT, {
      configId,
      identity: await fixture.emailToIdentity(CURRENT_USER_EMAIL),
    });

    // Verify all proposals are rejected
    const proposal1 = await fixture.engine.testing.configProposals.getById({
      id: proposal1Id,
      projectId: fixture.projectId,
    });
    const proposal2 = await fixture.engine.testing.configProposals.getById({
      id: proposal2Id,
      projectId: fixture.projectId,
    });
    const proposal3 = await fixture.engine.testing.configProposals.getById({
      id: proposal3Id,
      projectId: fixture.projectId,
    });

    assert(proposal1 && proposal2 && proposal3);
    expect(proposal1.rejectedAt).toBeDefined();
    expect(proposal1.approvedAt).toBeNull();
    expect(proposal1.reviewerId).toBe(1); // CURRENT_USER_ID is 1
    expect(proposal1.rejectionReason).toBe('rejected_explicitly');

    expect(proposal2.rejectedAt).toBeDefined();
    expect(proposal2.approvedAt).toBeNull();
    expect(proposal2.reviewerId).toBe(1);
    expect(proposal2.rejectionReason).toBe('rejected_explicitly');

    expect(proposal3.rejectedAt).toBeDefined();
    expect(proposal3.approvedAt).toBeNull();
    expect(proposal3.reviewerId).toBe(1);
    expect(proposal3.rejectionReason).toBe('rejected_explicitly');

    // Verify no pending proposals remain
    const pendingAfter = await fixture.engine.testing.configProposals.getPendingProposals({
      configId,
    });
    expect(pendingAfter).toHaveLength(0);
  });

  it('should create audit messages for all rejected proposals', async () => {
    const {configId} = await fixture.createConfig({
      overrides: [],
      name: 'reject_all_audit',
      value: {enabled: false},
      schema: null,
      description: 'Original description',
      identity: await fixture.emailToIdentity(CURRENT_USER_EMAIL),
      editorEmails: [],
      maintainerEmails: [CURRENT_USER_EMAIL, OTHER_USER_EMAIL],
      projectId: fixture.projectId,
    });

    const {configProposalId: proposal1Id} = await fixture.engine.useCases.createConfigProposal(
      GLOBAL_CONTEXT,
      {
        projectId: fixture.projectId,
        baseVersion: 1,
        configId,
        description: 'New description 1',
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

    const {configProposalId: proposal2Id} = await fixture.engine.useCases.createConfigProposal(
      GLOBAL_CONTEXT,
      {
        projectId: fixture.projectId,
        baseVersion: 1,
        configId,
        description: 'New description 2',
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

    await fixture.engine.useCases.rejectAllPendingConfigProposals(GLOBAL_CONTEXT, {
      configId,
      identity: await fixture.emailToIdentity(CURRENT_USER_EMAIL),
    });

    // Verify audit messages
    const auditMessages = await fixture.engine.testing.auditLogs.list({
      lte: fixture.now,
      limit: 100,
      orderBy: 'created_at desc, id desc',
      projectId: fixture.projectId,
    });

    const rejectionMessages = auditMessages.filter(
      msg => msg.payload.type === 'config_proposal_rejected',
    ) as Array<{payload: ConfigProposalRejectedAuditLogPayload}>;

    expect(rejectionMessages).toHaveLength(2);

    const rejection1 = rejectionMessages.find(msg => msg.payload.proposalId === proposal1Id);
    const rejection2 = rejectionMessages.find(msg => msg.payload.proposalId === proposal2Id);

    assert(rejection1);
    assert(rejection2);

    expect(rejection1.payload).toMatchObject({
      type: 'config_proposal_rejected',
      proposalId: proposal1Id,
      configId,
      proposedDescription: 'New description 1',
    });

    expect(rejection2.payload).toMatchObject({
      type: 'config_proposal_rejected',
      proposalId: proposal2Id,
      configId,
      proposedDescription: 'New description 2',
    });
  });

  it('should handle proposals with different change types', async () => {
    const {configId} = await fixture.createConfig({
      overrides: [],
      name: 'reject_all_types',
      value: asConfigValue({enabled: false}),
      schema: asConfigSchema({type: 'object', properties: {enabled: {type: 'boolean'}}}),
      description: 'Original description',
      identity: await fixture.emailToIdentity(CURRENT_USER_EMAIL),
      editorEmails: [],
      maintainerEmails: [CURRENT_USER_EMAIL, OTHER_USER_EMAIL],
      projectId: fixture.projectId,
    });

    // Config-level proposals: description, members, delete
    const {configProposalId: descriptionProposalId} =
      await fixture.engine.useCases.createConfigProposal(GLOBAL_CONTEXT, {
        baseVersion: 1,
        projectId: fixture.projectId,
        configId,
        description: 'Updated description',
        editorEmails: [],
        maintainerEmails: [CURRENT_USER_EMAIL, OTHER_USER_EMAIL],
        environmentVariants: [
          {
            environmentId: fixture.productionEnvironmentId,
            value: asConfigValue({enabled: false}),
            schema: asConfigSchema({type: 'object', properties: {enabled: {type: 'boolean'}}}),
            useBaseSchema: false,
            overrides: [],
          },
          {
            environmentId: fixture.developmentEnvironmentId,
            value: asConfigValue({enabled: false}),
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

    const {configProposalId: membersProposalId} =
      await fixture.engine.useCases.createConfigProposal(GLOBAL_CONTEXT, {
        baseVersion: 1,
        projectId: fixture.projectId,
        configId,
        description: 'Original description',
        editorEmails: [THIRD_USER_EMAIL],
        maintainerEmails: [CURRENT_USER_EMAIL],
        environmentVariants: [
          {
            environmentId: fixture.productionEnvironmentId,
            value: asConfigValue({enabled: false}),
            schema: asConfigSchema({type: 'object', properties: {enabled: {type: 'boolean'}}}),
            useBaseSchema: false,
            overrides: [],
          },
          {
            environmentId: fixture.developmentEnvironmentId,
            value: asConfigValue({enabled: false}),
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

    const {configProposalId: deleteProposalId} = await fixture.engine.useCases.createConfigProposal(
      GLOBAL_CONTEXT,
      {
        projectId: fixture.projectId,
        baseVersion: 1,
        configId,
        proposedDelete: true,
        identity: await fixture.emailToIdentity(OTHER_USER_EMAIL),
        description: 'Original description',
        editorEmails: [],
        maintainerEmails: [CURRENT_USER_EMAIL, OTHER_USER_EMAIL],
        environmentVariants: [
          {
            environmentId: fixture.productionEnvironmentId,
            value: asConfigValue({enabled: false}),
            schema: asConfigSchema({type: 'object', properties: {enabled: {type: 'boolean'}}}),
            useBaseSchema: false,
            overrides: [],
          },
        ],
        defaultVariant: {value: asConfigValue({x: 1}), schema: null, overrides: []},
        message: null,
      },
    );

    await fixture.engine.useCases.rejectAllPendingConfigProposals(GLOBAL_CONTEXT, {
      configId,
      identity: await fixture.emailToIdentity(CURRENT_USER_EMAIL),
    });

    // Verify all proposals are rejected
    const descriptionProposal = await fixture.engine.testing.configProposals.getById({
      id: descriptionProposalId,
      projectId: fixture.projectId,
    });
    const membersProposal = await fixture.engine.testing.configProposals.getById({
      id: membersProposalId,
      projectId: fixture.projectId,
    });
    const deleteProposal = await fixture.engine.testing.configProposals.getById({
      id: deleteProposalId,
      projectId: fixture.projectId,
    });

    assert(descriptionProposal && membersProposal && deleteProposal);
    expect(descriptionProposal.rejectedAt).toBeDefined();
    expect(membersProposal.rejectedAt).toBeDefined();
    expect(deleteProposal.rejectedAt).toBeDefined();

    // Verify audit messages include all proposal types
    const auditMessages = await fixture.engine.testing.auditLogs.list({
      lte: fixture.now,
      limit: 100,
      orderBy: 'created_at desc, id desc',
      projectId: fixture.projectId,
    });

    const rejectionMessages = auditMessages.filter(
      msg => msg.payload.type === 'config_proposal_rejected',
    ) as Array<{payload: ConfigProposalRejectedAuditLogPayload}>;

    expect(rejectionMessages.length).toBeGreaterThanOrEqual(3);

    const descriptionRejection = rejectionMessages.find(
      msg => msg.payload.proposalId === descriptionProposalId,
    );
    const membersRejection = rejectionMessages.find(
      msg => msg.payload.proposalId === membersProposalId,
    );
    const deleteRejection = rejectionMessages.find(
      msg => msg.payload.proposalId === deleteProposalId,
    );

    assert(descriptionRejection);
    assert(membersRejection);
    assert(deleteRejection);

    expect(descriptionRejection.payload.proposedDescription).toBeDefined();
    expect(membersRejection.payload.proposedMembers).toBeDefined();
    expect(deleteRejection.payload.proposedDelete).toBe(true);
  });

  it('should handle deletion proposals', async () => {
    const {configId} = await fixture.createConfig({
      overrides: [],
      name: 'reject_all_delete',
      value: {enabled: false},
      schema: null,
      description: 'Original description',
      identity: await fixture.emailToIdentity(CURRENT_USER_EMAIL),
      editorEmails: [],
      maintainerEmails: [CURRENT_USER_EMAIL, OTHER_USER_EMAIL],
      projectId: fixture.projectId,
    });

    const {configProposalId: deleteProposalId} = await fixture.engine.useCases.createConfigProposal(
      GLOBAL_CONTEXT,
      {
        projectId: fixture.projectId,
        baseVersion: 1,
        configId,
        proposedDelete: true,
        identity: await fixture.emailToIdentity(OTHER_USER_EMAIL),
        description: 'Original description',
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
      },
    );

    const {configProposalId: descProposalId} = await fixture.engine.useCases.createConfigProposal(
      GLOBAL_CONTEXT,
      {
        projectId: fixture.projectId,
        baseVersion: 1,
        configId,
        description: 'New desc',
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
            useBaseSchema: false,
            overrides: [],
          },
        ],
        identity: await fixture.emailToIdentity(OTHER_USER_EMAIL),
        proposedDelete: false,
        defaultVariant: {value: asConfigValue({x: 1}), schema: null, overrides: []},
        message: null,
      },
    );

    await fixture.engine.useCases.rejectAllPendingConfigProposals(GLOBAL_CONTEXT, {
      configId,
      identity: await fixture.emailToIdentity(CURRENT_USER_EMAIL),
    });

    // Verify both proposals are rejected
    const deleteProposal = await fixture.engine.testing.configProposals.getById({
      id: deleteProposalId,
      projectId: fixture.projectId,
    });
    const descProposal = await fixture.engine.testing.configProposals.getById({
      id: descProposalId,
      projectId: fixture.projectId,
    });

    assert(deleteProposal && descProposal);
    expect(deleteProposal.rejectedAt).toBeDefined();
    expect(descProposal.rejectedAt).toBeDefined();

    // Verify audit message for deletion proposal
    const auditMessages = await fixture.engine.testing.auditLogs.list({
      lte: fixture.now,
      limit: 100,
      orderBy: 'created_at desc, id desc',
      projectId: fixture.projectId,
    });

    const deleteRejection = auditMessages.find(
      msg =>
        msg.payload.type === 'config_proposal_rejected' &&
        msg.payload.proposalId === deleteProposalId,
    ) as {payload: ConfigProposalRejectedAuditLogPayload} | undefined;

    assert(deleteRejection);
    expect(deleteRejection.payload.proposedDelete).toBe(true);
  });

  it('should return successfully when there are no pending proposals', async () => {
    const {configId} = await fixture.createConfig({
      overrides: [],
      name: 'reject_all_empty',
      value: {enabled: false},
      schema: null,
      description: 'Original description',
      identity: await fixture.emailToIdentity(CURRENT_USER_EMAIL),
      editorEmails: [],
      maintainerEmails: [CURRENT_USER_EMAIL],
      projectId: fixture.projectId,
    });

    // Should not throw when there are no pending proposals
    await fixture.engine.useCases.rejectAllPendingConfigProposals(GLOBAL_CONTEXT, {
      configId,
      identity: await fixture.emailToIdentity(CURRENT_USER_EMAIL),
    });

    // Verify no audit messages were created for rejections
    const auditMessages = await fixture.engine.testing.auditLogs.list({
      lte: fixture.now,
      limit: 100,
      orderBy: 'created_at desc, id desc',
      projectId: fixture.projectId,
    });

    const rejectionMessages = auditMessages.filter(
      msg => msg.payload.type === 'config_proposal_rejected',
    );
    expect(rejectionMessages).toHaveLength(0);
  });

  it('should throw BadRequestError when config does not exist', async () => {
    const nonExistentConfigId = createUuidV4();

    await expect(
      fixture.engine.useCases.rejectAllPendingConfigProposals(GLOBAL_CONTEXT, {
        configId: nonExistentConfigId,
        identity: await fixture.emailToIdentity(CURRENT_USER_EMAIL),
      }),
    ).rejects.toThrow(BadRequestError);
  });

  it('should skip already approved proposals', async () => {
    const {configId} = await fixture.createConfig({
      overrides: [],
      name: 'reject_all_skip_approved',
      value: {enabled: false},
      schema: null,
      description: 'Original description',
      identity: await fixture.emailToIdentity(CURRENT_USER_EMAIL),
      editorEmails: [],
      maintainerEmails: [CURRENT_USER_EMAIL, OTHER_USER_EMAIL],
      projectId: fixture.projectId,
    });

    const {configProposalId: proposal1Id} = await fixture.engine.useCases.createConfigProposal(
      GLOBAL_CONTEXT,
      {
        projectId: fixture.projectId,
        baseVersion: 1,
        configId,
        description: 'Description 1',
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

    const {configProposalId: proposal2Id} = await fixture.engine.useCases.createConfigProposal(
      GLOBAL_CONTEXT,
      {
        projectId: fixture.projectId,
        baseVersion: 1,
        configId,
        description: 'Description 2',
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

    // Approve proposal 1
    await fixture.engine.useCases.approveConfigProposal(GLOBAL_CONTEXT, {
      projectId: fixture.projectId,
      proposalId: proposal1Id,
      identity: await fixture.emailToIdentity(CURRENT_USER_EMAIL),
    });

    // Reject all pending proposals (should only reject proposal 2)
    await fixture.engine.useCases.rejectAllPendingConfigProposals(GLOBAL_CONTEXT, {
      configId,
      identity: await fixture.emailToIdentity(CURRENT_USER_EMAIL),
    });

    // Verify proposal 1 is still approved
    const proposal1 = await fixture.engine.testing.configProposals.getById({
      id: proposal1Id,
      projectId: fixture.projectId,
    });
    assert(proposal1);
    expect(proposal1.approvedAt).toBeDefined();
    expect(proposal1.rejectedAt).toBeNull();

    // Verify proposal 2 is rejected
    const proposal2 = await fixture.engine.testing.configProposals.getById({
      id: proposal2Id,
      projectId: fixture.projectId,
    });
    assert(proposal2);
    expect(proposal2.rejectedAt).toBeDefined();
    expect(proposal2.approvedAt).toBeNull();
  });

  it('should skip already rejected proposals', async () => {
    const {configId} = await fixture.createConfig({
      overrides: [],
      name: 'reject_all_skip_rejected',
      value: {enabled: false},
      schema: null,
      description: 'Original description',
      identity: await fixture.emailToIdentity(CURRENT_USER_EMAIL),
      editorEmails: [],
      maintainerEmails: [CURRENT_USER_EMAIL, OTHER_USER_EMAIL],
      projectId: fixture.projectId,
    });

    const {configProposalId: proposal1Id} = await fixture.engine.useCases.createConfigProposal(
      GLOBAL_CONTEXT,
      {
        projectId: fixture.projectId,
        baseVersion: 1,
        configId,
        description: 'Description 1',
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

    const {configProposalId: proposal2Id} = await fixture.engine.useCases.createConfigProposal(
      GLOBAL_CONTEXT,
      {
        projectId: fixture.projectId,
        baseVersion: 1,
        configId,
        description: 'Description 2',
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

    // Manually reject proposal 1
    await fixture.engine.useCases.rejectConfigProposal(GLOBAL_CONTEXT, {
      projectId: fixture.projectId,
      proposalId: proposal1Id,
      identity: await fixture.emailToIdentity(CURRENT_USER_EMAIL),
    });

    // Reject all pending proposals (should only reject proposal 2)
    await fixture.engine.useCases.rejectAllPendingConfigProposals(GLOBAL_CONTEXT, {
      configId,
      identity: await fixture.emailToIdentity(CURRENT_USER_EMAIL),
    });

    // Verify proposal 1 is still rejected (not double-rejected)
    const proposal1 = await fixture.engine.testing.configProposals.getById({
      id: proposal1Id,
      projectId: fixture.projectId,
    });
    assert(proposal1);
    expect(proposal1.rejectedAt).toBeDefined();

    // Verify proposal 2 is rejected
    const proposal2 = await fixture.engine.testing.configProposals.getById({
      id: proposal2Id,
      projectId: fixture.projectId,
    });
    assert(proposal2);
    expect(proposal2.rejectedAt).toBeDefined();
  });

  it('should work via tRPC endpoint', async () => {
    const {configId} = await fixture.createConfig({
      overrides: [],
      name: 'reject_all_trpc',
      value: asConfigValue({enabled: false}),
      schema: null,
      description: 'Original description',
      identity: await fixture.emailToIdentity(CURRENT_USER_EMAIL),
      editorEmails: [],
      maintainerEmails: [CURRENT_USER_EMAIL, OTHER_USER_EMAIL],
      projectId: fixture.projectId,
    });

    const {configProposalId: proposal1Id} = await fixture.engine.useCases.createConfigProposal(
      GLOBAL_CONTEXT,
      {
        projectId: fixture.projectId,
        baseVersion: 1,
        configId,
        description: 'Description 1',
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

    const {configProposalId: proposal2Id} = await fixture.engine.useCases.createConfigProposal(
      GLOBAL_CONTEXT,
      {
        projectId: fixture.projectId,
        baseVersion: 1,
        configId,
        description: 'Description 2',
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

    // Reject all via tRPC
    await fixture.trpc.rejectAllPendingConfigProposals({
      configId,
    });

    // Verify all proposals are rejected
    const proposal1 = await fixture.engine.testing.configProposals.getById({
      id: proposal1Id,
      projectId: fixture.projectId,
    });
    const proposal2 = await fixture.engine.testing.configProposals.getById({
      id: proposal2Id,
      projectId: fixture.projectId,
    });

    assert(proposal1 && proposal2);
    expect(proposal1.rejectedAt).toBeDefined();
    expect(proposal2.rejectedAt).toBeDefined();

    // Verify no pending proposals remain
    const pendingAfter = await fixture.engine.testing.configProposals.getPendingProposals({
      configId,
    });
    expect(pendingAfter).toHaveLength(0);
  });
});
