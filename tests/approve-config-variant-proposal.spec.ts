import type {ConfigVariantProposalApprovedAuditLogPayload} from '@/engine/core/audit-log-store';
import {createConfigVariantProposalId} from '@/engine/core/config-variant-proposal-store';
import {GLOBAL_CONTEXT} from '@/engine/core/context';
import {BadRequestError, ForbiddenError} from '@/engine/core/errors';
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

describe('approveConfigVariantProposal', () => {
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

    // Note: undefined means "no change", so we don't use ?? null
    // Pass the values as-is, the store will handle serialization
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
      proposedValue: params.proposedValue,
      proposedSchema: params.proposedSchema,
      proposedOverrides: params.proposedOverrides,
      message: null,
    });

    return proposalId;
  }

  it('should approve a proposal with proposed value only', async () => {
    const {configId, configVariantId} = await createConfigWithVariant();

    const proposalId = await createVariantProposal({
      configVariantId,
      proposerId: 1, // CURRENT_USER
      proposedValue: {enabled: true},
    });

    await fixture.engine.useCases.approveConfigVariantProposal(GLOBAL_CONTEXT, {
      proposalId,
      currentUserEmail: OTHER_USER_EMAIL,
    });

    // Verify variant was updated
    const updatedVariant = await fixture.engine.testing.configVariants.getById(configVariantId);
    assert(updatedVariant);
    expect(updatedVariant.value).toEqual({enabled: true});
    expect(updatedVariant.version).toBe(2);

    // Verify proposal is no longer pending
    const pendingProposals =
      await fixture.engine.testing.configVariantProposals.getPendingByConfigVariantId(
        configVariantId,
      );
    expect(pendingProposals).toHaveLength(0);
  });

  it('should approve a proposal with proposed schema only', async () => {
    const {configVariantId} = await createConfigWithVariant();

    const newSchema = {type: 'object', properties: {enabled: {type: 'boolean'}}};

    // Need maintainer permission for schema changes
    // Re-create config with maintainer permission
    const {configId: configId2} = await fixture.engine.useCases.createConfig(GLOBAL_CONTEXT, {
      overrides: [],
      name: `schema_test_${Date.now()}`,
      value: {enabled: false},
      schema: null,
      description: 'Test config',
      currentUserEmail: CURRENT_USER_EMAIL,
      editorEmails: [],
      maintainerEmails: [CURRENT_USER_EMAIL, OTHER_USER_EMAIL],
      projectId: fixture.projectId,
    });

    const variants2 = await fixture.engine.testing.configVariants.getByConfigId(configId2);
    const variantId2 = variants2[0]?.id;
    assert(variantId2);

    const proposalId = await createVariantProposal({
      configVariantId: variantId2,
      proposerId: 1,
      proposedSchema: newSchema,
    });

    await fixture.engine.useCases.approveConfigVariantProposal(GLOBAL_CONTEXT, {
      proposalId,
      currentUserEmail: OTHER_USER_EMAIL,
    });

    // Verify variant was updated
    const updatedVariant = await fixture.engine.testing.configVariants.getById(variantId2);
    assert(updatedVariant);
    expect(updatedVariant.schema).toEqual(newSchema);
    expect(updatedVariant.version).toBe(2);
  });

  it('should approve a proposal with proposed overrides only', async () => {
    const {configVariantId} = await createConfigWithVariant();

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
      proposerId: 1,
      proposedOverrides: newOverrides,
    });

    await fixture.engine.useCases.approveConfigVariantProposal(GLOBAL_CONTEXT, {
      proposalId,
      currentUserEmail: OTHER_USER_EMAIL,
    });

    // Verify variant was updated
    const updatedVariant = await fixture.engine.testing.configVariants.getById(configVariantId);
    assert(updatedVariant);
    expect(updatedVariant.overrides).toEqual(newOverrides);
    expect(updatedVariant.version).toBe(2);
  });

  it('should approve a proposal with multiple fields', async () => {
    // Need maintainer permission for schema changes
    const {configId} = await fixture.engine.useCases.createConfig(GLOBAL_CONTEXT, {
      overrides: [],
      name: `multiple_test_${Date.now()}`,
      value: {count: 1},
      schema: {type: 'object', properties: {count: {type: 'number'}}},
      description: 'Test config',
      currentUserEmail: CURRENT_USER_EMAIL,
      editorEmails: [],
      maintainerEmails: [CURRENT_USER_EMAIL, OTHER_USER_EMAIL],
      projectId: fixture.projectId,
    });

    const variants = await fixture.engine.testing.configVariants.getByConfigId(configId);
    const configVariantId = variants[0]?.id;
    assert(configVariantId);

    const newSchema = {type: 'object', properties: {count: {type: 'number'}, active: {type: 'boolean'}}};

    const proposalId = await createVariantProposal({
      configVariantId,
      proposerId: 1,
      proposedValue: {count: 10},
      proposedSchema: newSchema,
    });

    await fixture.engine.useCases.approveConfigVariantProposal(GLOBAL_CONTEXT, {
      proposalId,
      currentUserEmail: OTHER_USER_EMAIL,
    });

    // Verify variant was updated
    const updatedVariant = await fixture.engine.testing.configVariants.getById(configVariantId);
    assert(updatedVariant);
    expect(updatedVariant.value).toEqual({count: 10});
    expect(updatedVariant.schema).toEqual(newSchema);
    expect(updatedVariant.version).toBe(2);
  });

  it('should reject all other pending proposals when approving one', async () => {
    const {configVariantId} = await createConfigWithVariant();

    // Create three proposals
    const proposalId1 = await createVariantProposal({
      configVariantId,
      proposerId: 1,
      proposedValue: {enabled: true},
    });

    const proposalId2 = await createVariantProposal({
      configVariantId,
      proposerId: 1,
      proposedValue: {enabled: false, extra: 1},
    });

    const proposalId3 = await createVariantProposal({
      configVariantId,
      proposerId: 1,
      proposedValue: {enabled: true, extra: 2},
    });

    // Verify all are pending
    const pendingBefore =
      await fixture.engine.testing.configVariantProposals.getPendingByConfigVariantId(
        configVariantId,
      );
    expect(pendingBefore).toHaveLength(3);

    // Approve proposal 2
    await fixture.engine.useCases.approveConfigVariantProposal(GLOBAL_CONTEXT, {
      proposalId: proposalId2,
      currentUserEmail: OTHER_USER_EMAIL,
    });

    // Verify no pending proposals remain
    const pendingAfter =
      await fixture.engine.testing.configVariantProposals.getPendingByConfigVariantId(
        configVariantId,
      );
    expect(pendingAfter).toHaveLength(0);

    // Verify proposals 1 and 3 are rejected in favor of proposal 2
    const rejectedProposal1 =
      await fixture.engine.testing.configVariantProposals.getById(proposalId1);
    assert(rejectedProposal1, 'Proposal 1 should exist');
    expect(rejectedProposal1.approvedAt).toBeNull();
    expect(rejectedProposal1.rejectedAt).not.toBeNull();
    expect(rejectedProposal1.reviewerId).toBe(OTHER_USER_ID);
    expect(rejectedProposal1.rejectedInFavorOfProposalId).toBe(proposalId2);
    expect(rejectedProposal1.rejectionReason).toBe('another_proposal_approved');

    const rejectedProposal3 =
      await fixture.engine.testing.configVariantProposals.getById(proposalId3);
    assert(rejectedProposal3, 'Proposal 3 should exist');
    expect(rejectedProposal3.approvedAt).toBeNull();
    expect(rejectedProposal3.rejectedAt).not.toBeNull();
    expect(rejectedProposal3.rejectedInFavorOfProposalId).toBe(proposalId2);
    expect(rejectedProposal3.rejectionReason).toBe('another_proposal_approved');

    // Verify variant has proposal 2's value
    const updatedVariant = await fixture.engine.testing.configVariants.getById(configVariantId);
    assert(updatedVariant);
    expect(updatedVariant.value).toEqual({enabled: false, extra: 1});
  });

  it('should throw error if proposal does not exist', async () => {
    await expect(
      fixture.engine.useCases.approveConfigVariantProposal(GLOBAL_CONTEXT, {
        proposalId: createUuidV4(),
        currentUserEmail: CURRENT_USER_EMAIL,
      }),
    ).rejects.toThrow(BadRequestError);
  });

  it('should throw error if proposal was already approved', async () => {
    const {configVariantId} = await createConfigWithVariant();

    const proposalId = await createVariantProposal({
      configVariantId,
      proposerId: 1,
      proposedValue: {enabled: true},
    });

    // Approve once
    await fixture.engine.useCases.approveConfigVariantProposal(GLOBAL_CONTEXT, {
      proposalId,
      currentUserEmail: OTHER_USER_EMAIL,
    });

    // Try to approve again
    await expect(
      fixture.engine.useCases.approveConfigVariantProposal(GLOBAL_CONTEXT, {
        proposalId,
        currentUserEmail: CURRENT_USER_EMAIL,
      }),
    ).rejects.toThrow(ForbiddenError);
  });

  it('should throw error if proposal was already rejected', async () => {
    const {configVariantId} = await createConfigWithVariant();

    const proposalId1 = await createVariantProposal({
      configVariantId,
      proposerId: 1,
      proposedValue: {enabled: true},
    });

    const proposalId2 = await createVariantProposal({
      configVariantId,
      proposerId: 1,
      proposedValue: {enabled: false},
    });

    // Approve proposal 2, which will reject proposal 1
    await fixture.engine.useCases.approveConfigVariantProposal(GLOBAL_CONTEXT, {
      proposalId: proposalId2,
      currentUserEmail: OTHER_USER_EMAIL,
    });

    // Try to approve the rejected proposal
    await expect(
      fixture.engine.useCases.approveConfigVariantProposal(GLOBAL_CONTEXT, {
        proposalId: proposalId1,
        currentUserEmail: CURRENT_USER_EMAIL,
      }),
    ).rejects.toThrow(ForbiddenError);
  });

  it('should throw error if user does not have edit permission', async () => {
    // Create config with only CURRENT_USER as editor
    const {configId} = await fixture.engine.useCases.createConfig(GLOBAL_CONTEXT, {
      overrides: [],
      name: `no_permission_${Date.now()}`,
      value: {x: 1},
      schema: null,
      description: 'Test',
      currentUserEmail: CURRENT_USER_EMAIL,
      editorEmails: [CURRENT_USER_EMAIL],
      maintainerEmails: [],
      projectId: fixture.projectId,
    });

    const variants = await fixture.engine.testing.configVariants.getByConfigId(configId);
    const configVariantId = variants[0]?.id;
    assert(configVariantId);

    const proposalId = await createVariantProposal({
      configVariantId,
      proposerId: 1,
      proposedValue: {x: 2},
    });

    // Try to approve as OTHER_USER without permissions
    await expect(
      fixture.engine.useCases.approveConfigVariantProposal(GLOBAL_CONTEXT, {
        proposalId,
        currentUserEmail: OTHER_USER_EMAIL,
      }),
    ).rejects.toThrow(ForbiddenError);
  });

  it('should throw error if config variant version has changed since proposal was created', async () => {
    const {configId, configVariantId} = await createConfigWithVariant();

    const proposalId = await createVariantProposal({
      configVariantId,
      proposerId: 1,
      proposedValue: {enabled: true},
    });

    // Update variant separately via patchConfigVariant
    // Note: This will automatically reject any pending proposals for this variant
    await fixture.engine.useCases.patchConfigVariant(GLOBAL_CONTEXT, {
      configVariantId,
      value: {newValue: {enabled: false, changed: true}},
      currentUserEmail: CURRENT_USER_EMAIL,
      prevVersion: 1,
    });

    // Try to approve proposal - should fail because the proposal was rejected when the patch happened
    await expect(
      fixture.engine.useCases.approveConfigVariantProposal(GLOBAL_CONTEXT, {
        proposalId,
        currentUserEmail: OTHER_USER_EMAIL,
      }),
    ).rejects.toThrow(ForbiddenError);
  });

  it('should handle schema removal proposal', async () => {
    // Create config with schema
    const {configId} = await fixture.engine.useCases.createConfig(GLOBAL_CONTEXT, {
      overrides: [],
      name: `schema_removal_${Date.now()}`,
      value: {x: 1},
      schema: {type: 'object', properties: {x: {type: 'number'}}},
      description: 'Test',
      currentUserEmail: CURRENT_USER_EMAIL,
      editorEmails: [],
      maintainerEmails: [CURRENT_USER_EMAIL, OTHER_USER_EMAIL],
      projectId: fixture.projectId,
    });

    const variants = await fixture.engine.testing.configVariants.getByConfigId(configId);
    const configVariantId = variants[0]?.id;
    assert(configVariantId);

    const proposalId = await createVariantProposal({
      configVariantId,
      proposerId: 1,
      proposedSchema: null,
    });

    await fixture.engine.useCases.approveConfigVariantProposal(GLOBAL_CONTEXT, {
      proposalId,
      currentUserEmail: OTHER_USER_EMAIL,
    });

    const updatedVariant = await fixture.engine.testing.configVariants.getById(configVariantId);
    assert(updatedVariant);
    expect(updatedVariant.schema).toBeNull();
    expect(updatedVariant.version).toBe(2);
  });

  it('should throw error if proposer tries to approve their own proposal', async () => {
    const {configVariantId} = await createConfigWithVariant();

    // Create proposal as CURRENT_USER
    const proposalId = await createVariantProposal({
      configVariantId,
      proposerId: 1, // CURRENT_USER_ID
      proposedValue: {enabled: true},
    });

    // Try to approve as the same user who created it
    await expect(
      fixture.engine.useCases.approveConfigVariantProposal(GLOBAL_CONTEXT, {
        proposalId,
        currentUserEmail: CURRENT_USER_EMAIL,
      }),
    ).rejects.toThrow(ForbiddenError);

    // Verify the proposal is still pending
    const pendingProposals =
      await fixture.engine.testing.configVariantProposals.getPendingByConfigVariantId(
        configVariantId,
      );
    expect(pendingProposals).toHaveLength(1);
    expect(pendingProposals[0]?.id).toBe(proposalId);

    // Verify that OTHER_USER can approve it
    await fixture.engine.useCases.approveConfigVariantProposal(GLOBAL_CONTEXT, {
      proposalId,
      currentUserEmail: OTHER_USER_EMAIL,
    });

    // Verify variant was updated
    const updatedVariant = await fixture.engine.testing.configVariants.getById(configVariantId);
    assert(updatedVariant);
    expect(updatedVariant.value).toEqual({enabled: true});
    expect(updatedVariant.version).toBe(2);
  });

  it('should set approvedAt timestamp on the approved proposal', async () => {
    const {configVariantId} = await createConfigWithVariant();

    const proposalId = await createVariantProposal({
      configVariantId,
      proposerId: 1,
      proposedValue: {enabled: true},
    });

    // Verify proposal has no approvedAt initially
    const proposalBefore = await fixture.engine.testing.configVariantProposals.getById(proposalId);
    expect(proposalBefore?.approvedAt).toBeNull();
    expect(proposalBefore?.reviewerId).toBeNull();

    // Approve the proposal
    await fixture.engine.useCases.approveConfigVariantProposal(GLOBAL_CONTEXT, {
      proposalId,
      currentUserEmail: OTHER_USER_EMAIL,
    });

    // Verify proposal now has approvedAt set
    const proposalAfter = await fixture.engine.testing.configVariantProposals.getById(proposalId);
    expect(proposalAfter?.approvedAt).not.toBeNull();
    expect(proposalAfter?.approvedAt).toBeInstanceOf(Date);
    expect(proposalAfter?.reviewerId).toBe(OTHER_USER_ID);
    expect(proposalAfter?.rejectedAt).toBeNull();
  });

  it('should create approval audit log', async () => {
    const {configId, configVariantId} = await createConfigWithVariant();

    const proposalId = await createVariantProposal({
      configVariantId,
      proposerId: 1,
      proposedValue: {enabled: true},
    });

    // Get audit logs before approval
    const auditLogsBefore = await fixture.engine.testing.auditLogs.list({
      lte: fixture.now,
      limit: 100,
      orderBy: 'created_at desc, id desc',
      projectId: fixture.projectId,
    });
    const beforeCount = auditLogsBefore.length;

    // Approve the proposal
    await fixture.engine.useCases.approveConfigVariantProposal(GLOBAL_CONTEXT, {
      proposalId,
      currentUserEmail: OTHER_USER_EMAIL,
    });

    // Get audit logs after approval
    const auditLogsAfter = await fixture.engine.testing.auditLogs.list({
      lte: fixture.now,
      limit: 100,
      orderBy: 'created_at desc, id desc',
      projectId: fixture.projectId,
    });

    // Should have at least 1 approval message + 1 config_variant_updated message
    expect(auditLogsAfter.length).toBeGreaterThanOrEqual(beforeCount + 2);

    // Find approval audit log
    const approvalLog = auditLogsAfter.find(
      log => log.payload.type === 'config_variant_proposal_approved',
    ) as {payload: ConfigVariantProposalApprovedAuditLogPayload; userId: number | null} | undefined;

    expect(approvalLog).toBeDefined();
    expect(approvalLog?.payload.proposalId).toBe(proposalId);
    expect(approvalLog?.payload.configVariantId).toBe(configVariantId);
    expect(approvalLog?.payload.configId).toBe(configId);
    expect(approvalLog?.payload.proposedValue).toEqual({newValue: {enabled: true}});
    expect(approvalLog?.payload.proposedSchema).toBeUndefined();
    expect(approvalLog?.payload.proposedOverrides).toBeUndefined();
    expect(approvalLog?.userId).toBe(OTHER_USER_ID);
  });

  it('should create approval audit log with schema', async () => {
    const {configId} = await fixture.engine.useCases.createConfig(GLOBAL_CONTEXT, {
      overrides: [],
      name: `audit_schema_${Date.now()}`,
      value: {x: 1},
      schema: {type: 'object', properties: {x: {type: 'number'}}},
      description: 'Test',
      currentUserEmail: CURRENT_USER_EMAIL,
      editorEmails: [],
      maintainerEmails: [CURRENT_USER_EMAIL, OTHER_USER_EMAIL],
      projectId: fixture.projectId,
    });

    const variants = await fixture.engine.testing.configVariants.getByConfigId(configId);
    const configVariantId = variants[0]?.id;
    assert(configVariantId);

    const newSchema = {type: 'object', properties: {x: {type: 'number'}, y: {type: 'string'}}};

    const proposalId = await createVariantProposal({
      configVariantId,
      proposerId: 1,
      proposedSchema: newSchema,
    });

    await fixture.engine.useCases.approveConfigVariantProposal(GLOBAL_CONTEXT, {
      proposalId,
      currentUserEmail: OTHER_USER_EMAIL,
    });

    // Get audit logs
    const auditLogs = await fixture.engine.testing.auditLogs.list({
      lte: fixture.now,
      limit: 100,
      orderBy: 'created_at desc, id desc',
      projectId: fixture.projectId,
    });

    // Find approval audit log
    const approvalLog = auditLogs.find(
      log => log.payload.type === 'config_variant_proposal_approved',
    ) as {payload: ConfigVariantProposalApprovedAuditLogPayload} | undefined;

    expect(approvalLog).toBeDefined();
    expect(approvalLog?.payload.proposalId).toBe(proposalId);
    expect(approvalLog?.payload.proposedSchema).toEqual({newSchema});
    expect(approvalLog?.payload.proposedValue).toBeUndefined();
    expect(approvalLog?.payload.proposedOverrides).toBeUndefined();
  });

  it('should throw error if non-editor tries to approve proposal with value change', async () => {
    const {configId, configVariantId} = await createConfigWithVariant();

    const proposalId = await createVariantProposal({
      configVariantId,
      proposerId: 1,
      proposedValue: {enabled: true},
    });

    // Try to approve as THIRD_USER who is not an editor
    await expect(
      fixture.engine.useCases.approveConfigVariantProposal(GLOBAL_CONTEXT, {
        proposalId,
        currentUserEmail: THIRD_USER_EMAIL,
      }),
    ).rejects.toThrow(ForbiddenError);

    // Verify proposal is still pending
    const pendingProposals =
      await fixture.engine.testing.configVariantProposals.getPendingByConfigVariantId(
        configVariantId,
      );
    expect(pendingProposals).toHaveLength(1);

    // Verify OTHER_USER (who is an editor) can approve it
    await fixture.engine.useCases.approveConfigVariantProposal(GLOBAL_CONTEXT, {
      proposalId,
      currentUserEmail: OTHER_USER_EMAIL,
    });

    const updatedVariant = await fixture.engine.testing.configVariants.getById(configVariantId);
    expect(updatedVariant?.value).toEqual({enabled: true});
  });

  it('should throw error if non-owner tries to approve proposal with schema change', async () => {
    const {configId} = await fixture.engine.useCases.createConfig(GLOBAL_CONTEXT, {
      overrides: [],
      name: `schema_permission_${Date.now()}`,
      value: {x: 1},
      schema: {type: 'object', properties: {x: {type: 'number'}}},
      description: 'Test',
      currentUserEmail: CURRENT_USER_EMAIL,
      editorEmails: [OTHER_USER_EMAIL],
      maintainerEmails: [CURRENT_USER_EMAIL],
      projectId: fixture.projectId,
    });

    const variants = await fixture.engine.testing.configVariants.getByConfigId(configId);
    const configVariantId = variants[0]?.id;
    assert(configVariantId);

    const newSchema = {type: 'object', properties: {x: {type: 'number'}, y: {type: 'string'}}};

    const proposalId = await createVariantProposal({
      configVariantId,
      proposerId: 1,
      proposedSchema: newSchema,
    });

    // Try to approve as OTHER_USER who is an editor but not a maintainer
    await expect(
      fixture.engine.useCases.approveConfigVariantProposal(GLOBAL_CONTEXT, {
        proposalId,
        currentUserEmail: OTHER_USER_EMAIL,
      }),
    ).rejects.toThrow(ForbiddenError);

    // Verify proposal is still pending
    const pendingProposals =
      await fixture.engine.testing.configVariantProposals.getPendingByConfigVariantId(
        configVariantId,
      );
    expect(pendingProposals).toHaveLength(1);
  });

  it('should allow owner to approve proposal with schema change', async () => {
    const {configId} = await fixture.engine.useCases.createConfig(GLOBAL_CONTEXT, {
      overrides: [],
      name: `owner_schema_${Date.now()}`,
      value: {x: 1},
      schema: {type: 'object', properties: {x: {type: 'number'}}},
      description: 'Test',
      currentUserEmail: CURRENT_USER_EMAIL,
      editorEmails: [],
      maintainerEmails: [CURRENT_USER_EMAIL, OTHER_USER_EMAIL],
      projectId: fixture.projectId,
    });

    const variants = await fixture.engine.testing.configVariants.getByConfigId(configId);
    const configVariantId = variants[0]?.id;
    assert(configVariantId);

    const newSchema = {type: 'object', properties: {x: {type: 'number'}, y: {type: 'string'}}};

    const proposalId = await createVariantProposal({
      configVariantId,
      proposerId: 1,
      proposedSchema: newSchema,
    });

    // Approve as OTHER_USER who is a maintainer
    await fixture.engine.useCases.approveConfigVariantProposal(GLOBAL_CONTEXT, {
      proposalId,
      currentUserEmail: OTHER_USER_EMAIL,
    });

    // Verify schema was updated
    const updatedVariant = await fixture.engine.testing.configVariants.getById(configVariantId);
    assert(updatedVariant);
    expect(updatedVariant.schema).toEqual(newSchema);
    expect(updatedVariant.version).toBe(2);
  });

  it('should throw error if editor tries to approve proposal with schema removal', async () => {
    const {configId} = await fixture.engine.useCases.createConfig(GLOBAL_CONTEXT, {
      overrides: [],
      name: `schema_removal_perm_${Date.now()}`,
      value: {x: 1},
      schema: {type: 'object', properties: {x: {type: 'number'}}},
      description: 'Test',
      currentUserEmail: CURRENT_USER_EMAIL,
      editorEmails: [OTHER_USER_EMAIL],
      maintainerEmails: [CURRENT_USER_EMAIL],
      projectId: fixture.projectId,
    });

    const variants = await fixture.engine.testing.configVariants.getByConfigId(configId);
    const configVariantId = variants[0]?.id;
    assert(configVariantId);

    const proposalId = await createVariantProposal({
      configVariantId,
      proposerId: 1,
      proposedSchema: null, // Remove schema
    });

    // Try to approve as OTHER_USER who is an editor but not a maintainer
    await expect(
      fixture.engine.useCases.approveConfigVariantProposal(GLOBAL_CONTEXT, {
        proposalId,
        currentUserEmail: OTHER_USER_EMAIL,
      }),
    ).rejects.toThrow(ForbiddenError);

    // Verify proposal is still pending
    const pendingProposals =
      await fixture.engine.testing.configVariantProposals.getPendingByConfigVariantId(
        configVariantId,
      );
    expect(pendingProposals).toHaveLength(1);
  });

  it('should not apply any changes if approval fails due to permission', async () => {
    const {configId} = await fixture.engine.useCases.createConfig(GLOBAL_CONTEXT, {
      overrides: [],
      name: `no_changes_fail_${Date.now()}`,
      value: {x: 1},
      schema: null,
      description: 'Test',
      currentUserEmail: CURRENT_USER_EMAIL,
      editorEmails: [CURRENT_USER_EMAIL],
      maintainerEmails: [],
      projectId: fixture.projectId,
    });

    const variants = await fixture.engine.testing.configVariants.getByConfigId(configId);
    const configVariantId = variants[0]?.id;
    const originalVariant = variants[0];
    assert(configVariantId);

    const proposalId = await createVariantProposal({
      configVariantId,
      proposerId: 1,
      proposedValue: {x: 999},
    });

    // Try to approve as OTHER_USER without permissions (should fail)
    await expect(
      fixture.engine.useCases.approveConfigVariantProposal(GLOBAL_CONTEXT, {
        proposalId,
        currentUserEmail: OTHER_USER_EMAIL,
      }),
    ).rejects.toThrow(ForbiddenError);

    // Verify variant is unchanged
    const variant = await fixture.engine.testing.configVariants.getById(configVariantId);
    assert(variant);
    expect(variant.value).toEqual({x: 1});
    expect(variant.version).toBe(originalVariant?.version);
  });

  it('should record the correct user as the approver', async () => {
    const {configVariantId} = await createConfigWithVariant();

    // Create proposal as CURRENT_USER
    const proposalId = await createVariantProposal({
      configVariantId,
      proposerId: 1,
      proposedValue: {enabled: true},
    });

    // Approve as OTHER_USER
    await fixture.engine.useCases.approveConfigVariantProposal(GLOBAL_CONTEXT, {
      proposalId,
      currentUserEmail: OTHER_USER_EMAIL,
    });

    // Verify proposal has correct reviewerId
    const proposal = await fixture.engine.testing.configVariantProposals.getById(proposalId);
    assert(proposal);
    expect(proposal.reviewerId).toBe(OTHER_USER_ID);

    // Verify audit log has correct userId
    const auditLogs = await fixture.engine.testing.auditLogs.list({
      lte: fixture.now,
      limit: 100,
      orderBy: 'created_at desc, id desc',
      projectId: fixture.projectId,
    });
    const approvalLog = auditLogs.find(
      log => log.payload.type === 'config_variant_proposal_approved',
    );
    expect(approvalLog?.userId).toBe(OTHER_USER_ID);
  });
});

describe('approveConfigVariantProposal with allowSelfApprovals enabled', () => {
  const fixture = useAppFixture({
    authEmail: CURRENT_USER_EMAIL,
    allowSelfApprovals: true,
  });

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

  it('should allow proposer to approve their own proposal', async () => {
    const {configId} = await fixture.engine.useCases.createConfig(GLOBAL_CONTEXT, {
      overrides: [],
      name: `self_approve_${Date.now()}`,
      value: {count: 1},
      schema: null,
      description: 'Test',
      currentUserEmail: CURRENT_USER_EMAIL,
      editorEmails: [CURRENT_USER_EMAIL],
      maintainerEmails: [],
      projectId: fixture.projectId,
    });

    const variants = await fixture.engine.testing.configVariants.getByConfigId(configId);
    const configVariantId = variants[0]?.id;
    assert(configVariantId);

    const proposalId = createConfigVariantProposalId();
    const variant = await fixture.engine.testing.configVariants.getById(configVariantId);
    assert(variant);

    await fixture.engine.testing.configVariantProposals.create({
      id: proposalId,
      configVariantId,
      baseVariantVersion: variant.version,
      proposerId: 1, // CURRENT_USER
      createdAt: fixture.now,
      rejectedAt: null,
      approvedAt: null,
      reviewerId: null,
      rejectedInFavorOfProposalId: null,
      rejectionReason: null,
      proposedValue: {count: 2},
      proposedSchema: null,
      proposedOverrides: null,
      message: null,
    });

    // Should not throw error because allowSelfApprovals is enabled
    await fixture.engine.useCases.approveConfigVariantProposal(GLOBAL_CONTEXT, {
      proposalId,
      currentUserEmail: CURRENT_USER_EMAIL,
    });

    // Verify variant was updated
    const updatedVariant = await fixture.engine.testing.configVariants.getById(configVariantId);
    assert(updatedVariant);
    expect(updatedVariant.value).toEqual({count: 2});
    expect(updatedVariant.version).toBe(2);

    // Verify proposal is approved
    const proposal = await fixture.engine.testing.configVariantProposals.getById(proposalId);
    expect(proposal?.approvedAt).toBeDefined();
    expect(proposal?.reviewerId).toBe(1); // CURRENT_USER_ID
  });
});

