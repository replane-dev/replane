import type {ConfigVariantProposalRejectedAuditLogPayload} from '@/engine/core/audit-log-store';
import {createConfigVariantProposalId} from '@/engine/core/config-variant-proposal-store';
import {GLOBAL_CONTEXT} from '@/engine/core/context';
import {BadRequestError} from '@/engine/core/errors';
import type {Override} from '@/engine/core/override-condition-schemas';
import {normalizeEmail} from '@/engine/core/utils';
import {createUuidV4} from '@/engine/core/uuid';
import {assert, beforeEach, describe, expect, it} from 'vitest';
import {useAppFixture} from './fixtures/trpc-fixture';

const CURRENT_USER_EMAIL = normalizeEmail('test@example.com');
const OTHER_USER_EMAIL = normalizeEmail('other@example.com');
const THIRD_USER_EMAIL = normalizeEmail('third@example.com');

const OTHER_USER_ID = 2;
const THIRD_USER_ID = 3;

describe('rejectConfigVariantProposal', () => {
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

  async function createConfigWithVariant() {
    const {configId} = await fixture.engine.useCases.createConfig(GLOBAL_CONTEXT, {
      overrides: [],
      name: `test_config_${Date.now()}`,
      value: {enabled: false},
      schema: null,
      description: 'Test config',
      currentUserEmail: CURRENT_USER_EMAIL,
      editorEmails: [CURRENT_USER_EMAIL, OTHER_USER_EMAIL],
      maintainerEmails: [],
      projectId: fixture.projectId,
    });

    // Get the first config variant (production by default)
    const variants = await fixture.engine.testing.configVariants.getByConfigId(configId);
    const configVariantId = variants[0]?.id;
    assert(configVariantId, 'Config variant should exist');

    return {configId, configVariantId, variant: variants[0]};
  }

  async function createVariantProposal(params: {
    configVariantId: string;
    proposerId: number;
    proposedValue?: unknown;
    proposedSchema?: unknown;
    proposedOverrides?: Override[];
  }) {
    const proposalId = createConfigVariantProposalId();
    const variant = await fixture.engine.testing.configVariants.getById(params.configVariantId);
    assert(variant, 'Variant not found');

    await fixture.engine.testing.configVariantProposals.create({
      id: proposalId,
      configVariantId: params.configVariantId,
      baseVariantVersion: variant.version,
      proposerId: params.proposerId,
      createdAt: fixture.now,
      rejectedAt: null,
      approvedAt: null,
      reviewerId: null,
      rejectedInFavorOfProposalId: null,
      rejectionReason: null,
      proposedValue: params.proposedValue ?? null,
      proposedSchema: params.proposedSchema ?? null,
      proposedOverrides: params.proposedOverrides ?? null,
      message: null,
    });

    return proposalId;
  }

  it('should reject a proposal with value change', async () => {
    const {configId, configVariantId} = await createConfigWithVariant();

    const proposalId = await createVariantProposal({
      configVariantId,
      proposerId: OTHER_USER_ID,
      proposedValue: {enabled: true},
    });

    await fixture.engine.useCases.rejectConfigVariantProposal(GLOBAL_CONTEXT, {
      proposalId,
      currentUserEmail: CURRENT_USER_EMAIL,
    });

    // Verify proposal is rejected
    const proposal = await fixture.engine.testing.configVariantProposals.getById(proposalId);
    assert(proposal);
    expect(proposal.rejectedAt).toBeDefined();
    expect(proposal.approvedAt).toBeNull();
    expect(proposal.reviewerId).toBe(1); // CURRENT_USER_ID is 1
    expect(proposal.rejectionReason).toBe('rejected_explicitly');

    // Verify audit log
    const auditLogs = await fixture.engine.testing.auditLogs.list({
      lte: fixture.now,
      limit: 100,
      orderBy: 'created_at desc, id desc',
      projectId: fixture.projectId,
    });
    const rejectionLog = auditLogs.find(
      log =>
        log.payload.type === 'config_variant_proposal_rejected' &&
        log.payload.proposalId === proposalId,
    ) as {payload: ConfigVariantProposalRejectedAuditLogPayload} | undefined;
    assert(rejectionLog);
    expect(rejectionLog.payload).toMatchObject({
      type: 'config_variant_proposal_rejected',
      proposalId,
      configVariantId,
      configId,
      proposedValue: {newValue: {enabled: true}},
    });
  });

  it('should reject a proposal with schema change', async () => {
    const {configId, configVariantId} = await createConfigWithVariant();

    const newSchema = {
      type: 'object',
      properties: {
        enabled: {type: 'boolean'},
        threshold: {type: 'number'},
      },
    };

    const proposalId = await createVariantProposal({
      configVariantId,
      proposerId: OTHER_USER_ID,
      proposedSchema: newSchema,
    });

    await fixture.engine.useCases.rejectConfigVariantProposal(GLOBAL_CONTEXT, {
      proposalId,
      currentUserEmail: CURRENT_USER_EMAIL,
    });

    // Verify proposal is rejected
    const proposal = await fixture.engine.testing.configVariantProposals.getById(proposalId);
    assert(proposal);
    expect(proposal.rejectedAt).toBeDefined();

    // Verify audit log includes proposed schema
    const auditLogs = await fixture.engine.testing.auditLogs.list({
      lte: fixture.now,
      limit: 100,
      orderBy: 'created_at desc, id desc',
      projectId: fixture.projectId,
    });
    const rejectionLog = auditLogs.find(
      log =>
        log.payload.type === 'config_variant_proposal_rejected' &&
        log.payload.proposalId === proposalId,
    ) as {payload: ConfigVariantProposalRejectedAuditLogPayload} | undefined;
    assert(rejectionLog);
    expect(rejectionLog.payload.proposedSchema).toEqual({newSchema});
  });

  it('should reject a proposal with overrides change', async () => {
    const {configId, configVariantId} = await createConfigWithVariant();

    const newOverrides: Override[] = [
      {
        name: 'US users',
        conditions: [
          {
            property: 'country',
            operator: 'equals' as const,
            value: {type: 'literal' as const, value: 'US'},
          },
        ],
        value: {enabled: true},
      },
    ];

    const proposalId = await createVariantProposal({
      configVariantId,
      proposerId: OTHER_USER_ID,
      proposedOverrides: newOverrides,
    });

    await fixture.engine.useCases.rejectConfigVariantProposal(GLOBAL_CONTEXT, {
      proposalId,
      currentUserEmail: CURRENT_USER_EMAIL,
    });

    // Verify proposal is rejected
    const proposal = await fixture.engine.testing.configVariantProposals.getById(proposalId);
    assert(proposal);
    expect(proposal.rejectedAt).toBeDefined();

    // Verify audit log includes proposed overrides
    const auditLogs = await fixture.engine.testing.auditLogs.list({
      lte: fixture.now,
      limit: 100,
      orderBy: 'created_at desc, id desc',
      projectId: fixture.projectId,
    });
    const rejectionLog = auditLogs.find(
      log =>
        log.payload.type === 'config_variant_proposal_rejected' &&
        log.payload.proposalId === proposalId,
    ) as {payload: ConfigVariantProposalRejectedAuditLogPayload} | undefined;
    assert(rejectionLog);
    expect(rejectionLog.payload.proposedOverrides).toEqual({newOverrides});
  });

  it('should reject a proposal with multiple changes', async () => {
    const {configId, configVariantId} = await createConfigWithVariant();

    const newSchema = {
      type: 'object',
      properties: {
        enabled: {type: 'boolean'},
      },
    };

    const newOverrides: Override[] = [
      {
        name: 'Staging env',
        conditions: [
          {
            property: 'env',
            operator: 'equals' as const,
            value: {type: 'literal' as const, value: 'staging'},
          },
        ],
        value: {enabled: false},
      },
    ];

    const proposalId = await createVariantProposal({
      configVariantId,
      proposerId: OTHER_USER_ID,
      proposedValue: {enabled: true},
      proposedSchema: newSchema,
      proposedOverrides: newOverrides,
    });

    await fixture.engine.useCases.rejectConfigVariantProposal(GLOBAL_CONTEXT, {
      proposalId,
      currentUserEmail: CURRENT_USER_EMAIL,
    });

    // Verify audit log includes all proposed changes
    const auditLogs = await fixture.engine.testing.auditLogs.list({
      lte: fixture.now,
      limit: 100,
      orderBy: 'created_at desc, id desc',
      projectId: fixture.projectId,
    });
    const rejectionLog = auditLogs.find(
      log =>
        log.payload.type === 'config_variant_proposal_rejected' &&
        log.payload.proposalId === proposalId,
    ) as {payload: ConfigVariantProposalRejectedAuditLogPayload} | undefined;
    assert(rejectionLog);
    expect(rejectionLog.payload).toMatchObject({
      type: 'config_variant_proposal_rejected',
      proposalId,
      configVariantId,
      configId,
      proposedValue: {newValue: {enabled: true}},
      proposedSchema: {newSchema},
      proposedOverrides: {newOverrides},
    });
  });

  it('should set rejectedInFavorOfProposalId to undefined (explicit rejection)', async () => {
    const {configVariantId} = await createConfigWithVariant();

    const proposalId = await createVariantProposal({
      configVariantId,
      proposerId: OTHER_USER_ID,
      proposedValue: {enabled: true},
    });

    await fixture.engine.useCases.rejectConfigVariantProposal(GLOBAL_CONTEXT, {
      proposalId,
      currentUserEmail: CURRENT_USER_EMAIL,
    });

    // Verify audit log has undefined rejectedInFavorOfProposalId (explicit rejection)
    const auditLogs = await fixture.engine.testing.auditLogs.list({
      lte: fixture.now,
      limit: 100,
      orderBy: 'created_at desc, id desc',
      projectId: fixture.projectId,
    });
    const rejectionLog = auditLogs.find(
      log =>
        log.payload.type === 'config_variant_proposal_rejected' &&
        log.payload.proposalId === proposalId,
    ) as {payload: ConfigVariantProposalRejectedAuditLogPayload} | undefined;
    assert(rejectionLog);
    expect(rejectionLog.payload.rejectedInFavorOfProposalId).toBeUndefined();
  });

  it('should allow anyone to reject a proposal (no permission check)', async () => {
    const {configVariantId} = await createConfigWithVariant();

    // Create proposal by THIRD_USER (who is not a member)
    const proposalId = await createVariantProposal({
      configVariantId,
      proposerId: THIRD_USER_ID,
      proposedValue: {enabled: true},
    });

    // THIRD_USER can reject their own proposal (no permission check)
    await fixture.engine.useCases.rejectConfigVariantProposal(GLOBAL_CONTEXT, {
      proposalId,
      currentUserEmail: THIRD_USER_EMAIL,
    });

    // Verify proposal is rejected
    const proposal = await fixture.engine.testing.configVariantProposals.getById(proposalId);
    assert(proposal);
    expect(proposal.rejectedAt).toBeDefined();
  });

  it('should allow multiple users to reject different proposals', async () => {
    const {configVariantId} = await createConfigWithVariant();

    // Create multiple proposals
    const proposalId1 = await createVariantProposal({
      configVariantId,
      proposerId: OTHER_USER_ID,
      proposedValue: {enabled: true},
    });

    const proposalId2 = await createVariantProposal({
      configVariantId,
      proposerId: THIRD_USER_ID,
      proposedSchema: {type: 'object'},
    });

    // Different users reject different proposals
    await fixture.engine.useCases.rejectConfigVariantProposal(GLOBAL_CONTEXT, {
      proposalId: proposalId1,
      currentUserEmail: CURRENT_USER_EMAIL,
    });

    await fixture.engine.useCases.rejectConfigVariantProposal(GLOBAL_CONTEXT, {
      proposalId: proposalId2,
      currentUserEmail: OTHER_USER_EMAIL,
    });

    // Verify both proposals are rejected
    const p1 = await fixture.engine.testing.configVariantProposals.getById(proposalId1);
    const p2 = await fixture.engine.testing.configVariantProposals.getById(proposalId2);
    assert(p1 && p2);
    expect(p1.rejectedAt).toBeDefined();
    expect(p2.rejectedAt).toBeDefined();
  });

  it('should throw BadRequestError when rejecting non-existent proposal', async () => {
    const nonExistentProposalId = createUuidV4();

    await expect(
      fixture.engine.useCases.rejectConfigVariantProposal(GLOBAL_CONTEXT, {
        proposalId: nonExistentProposalId,
        currentUserEmail: CURRENT_USER_EMAIL,
      }),
    ).rejects.toThrow(BadRequestError);
  });

  it('should throw BadRequestError when rejecting already rejected proposal', async () => {
    const {configVariantId} = await createConfigWithVariant();

    const proposalId = await createVariantProposal({
      configVariantId,
      proposerId: OTHER_USER_ID,
      proposedValue: {enabled: true},
    });

    // Reject proposal
    await fixture.engine.useCases.rejectConfigVariantProposal(GLOBAL_CONTEXT, {
      proposalId,
      currentUserEmail: CURRENT_USER_EMAIL,
    });

    // Try to reject again
    await expect(
      fixture.engine.useCases.rejectConfigVariantProposal(GLOBAL_CONTEXT, {
        proposalId,
        currentUserEmail: OTHER_USER_EMAIL,
      }),
    ).rejects.toThrow(BadRequestError);
  });

  it('should throw BadRequestError when rejecting already approved proposal', async () => {
    const {configVariantId} = await createConfigWithVariant();

    const proposalId = await createVariantProposal({
      configVariantId,
      proposerId: OTHER_USER_ID,
      proposedValue: {enabled: true},
    });

    // Approve proposal directly via store
    await fixture.engine.testing.configVariantProposals.approve({
      id: proposalId,
      approvedAt: fixture.now,
      reviewerId: 1,
    });

    // Try to reject
    await expect(
      fixture.engine.useCases.rejectConfigVariantProposal(GLOBAL_CONTEXT, {
        proposalId,
        currentUserEmail: CURRENT_USER_EMAIL,
      }),
    ).rejects.toThrow(BadRequestError);
  });

  it('should set reviewerId when rejecting a proposal', async () => {
    const {configVariantId} = await createConfigWithVariant();

    const proposalId = await createVariantProposal({
      configVariantId,
      proposerId: OTHER_USER_ID,
      proposedValue: {enabled: true},
    });

    // Reject proposal
    await fixture.engine.useCases.rejectConfigVariantProposal(GLOBAL_CONTEXT, {
      proposalId,
      currentUserEmail: CURRENT_USER_EMAIL,
    });

    // Verify proposal has reviewerId
    const proposal = await fixture.engine.testing.configVariantProposals.getById(proposalId);
    assert(proposal);
    expect(proposal.reviewerId).toBe(1); // CURRENT_USER_ID is 1
  });

  it('should not apply any changes to the config variant when rejecting', async () => {
    const {configVariantId, variant} = await createConfigWithVariant();

    const proposalId = await createVariantProposal({
      configVariantId,
      proposerId: OTHER_USER_ID,
      proposedValue: {enabled: true},
      proposedSchema: {type: 'object', properties: {enabled: {type: 'boolean'}}},
    });

    // Reject proposal
    await fixture.engine.useCases.rejectConfigVariantProposal(GLOBAL_CONTEXT, {
      proposalId,
      currentUserEmail: CURRENT_USER_EMAIL,
    });

    // Verify config variant is unchanged
    const updatedVariant = await fixture.engine.testing.configVariants.getById(configVariantId);
    assert(updatedVariant);
    expect(updatedVariant.value).toEqual({enabled: false});
    expect(updatedVariant.schema).toBeNull();
    expect(updatedVariant.version).toBe(variant.version); // Version should not change
  });

  it('should record the correct user as the rejector in audit log', async () => {
    const {configVariantId} = await createConfigWithVariant();

    // Create proposal by OTHER_USER
    const proposalId = await createVariantProposal({
      configVariantId,
      proposerId: OTHER_USER_ID,
      proposedValue: {enabled: true},
    });

    // Reject by CURRENT_USER
    await fixture.engine.useCases.rejectConfigVariantProposal(GLOBAL_CONTEXT, {
      proposalId,
      currentUserEmail: CURRENT_USER_EMAIL,
    });

    // Verify audit log has correct userId (rejector, not proposer)
    const auditLogs = await fixture.engine.testing.auditLogs.list({
      lte: fixture.now,
      limit: 100,
      orderBy: 'created_at desc, id desc',
      projectId: fixture.projectId,
    });
    const rejectionLog = auditLogs.find(
      log =>
        log.payload.type === 'config_variant_proposal_rejected' &&
        log.payload.proposalId === proposalId,
    ) as {payload: ConfigVariantProposalRejectedAuditLogPayload; userId: number} | undefined;
    assert(rejectionLog);
    expect(rejectionLog.userId).toBe(1); // CURRENT_USER_ID is 1
  });
});
