import {createConfigVariantProposalId} from '@/engine/core/config-variant-proposal-store';
import {GLOBAL_CONTEXT} from '@/engine/core/context';
import {BadRequestError} from '@/engine/core/errors';
import {normalizeEmail} from '@/engine/core/utils';
import {createUuidV4} from '@/engine/core/uuid';
import {assert, beforeEach, describe, expect, it} from 'vitest';
import {TEST_USER_ID, useAppFixture} from './fixtures/trpc-fixture';

const CURRENT_USER_EMAIL = normalizeEmail('test@example.com');
const OTHER_USER_EMAIL = normalizeEmail('other@example.com');
const THIRD_USER_EMAIL = normalizeEmail('third@example.com');

const OTHER_USER_ID = 2;
const THIRD_USER_ID = 3;

describe('rejectAllPendingConfigVariantProposals', () => {
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
      description: 'Test description',
      currentUserEmail: CURRENT_USER_EMAIL,
      editorEmails: [CURRENT_USER_EMAIL, OTHER_USER_EMAIL, THIRD_USER_EMAIL],
      maintainerEmails: [],
      projectId: fixture.projectId,
    });

    const variants = await fixture.engine.testing.configVariants.getByConfigId(configId);
    const configVariantId = variants[0]?.id;
    assert(configVariantId, 'Config variant should exist');

    return {configId, configVariantId, variant: variants[0]};
  }

  it('should reject all pending variant proposals for a config variant', async () => {
    const {configVariantId, variant} = await createConfigWithVariant();

    // Create multiple variant proposals directly in DB
    const proposal1Id = createConfigVariantProposalId();
    await fixture.engine.testing.configVariantProposals.create({
      id: proposal1Id,
      configVariantId,
      baseVariantVersion: variant.version,
      proposerId: OTHER_USER_ID,
      createdAt: fixture.now,
      rejectedAt: null,
      approvedAt: null,
      reviewerId: null,
      rejectedInFavorOfProposalId: null,
      rejectionReason: null,
      proposedValue: {enabled: true},
      proposedSchema: null,
      proposedOverrides: null,
      message: null,
    });

    const proposal2Id = createConfigVariantProposalId();
    await fixture.engine.testing.configVariantProposals.create({
      id: proposal2Id,
      configVariantId,
      baseVariantVersion: variant.version,
      proposerId: THIRD_USER_ID,
      createdAt: fixture.now,
      rejectedAt: null,
      approvedAt: null,
      reviewerId: null,
      rejectedInFavorOfProposalId: null,
      rejectionReason: null,
      proposedValue: {count: 42},
      proposedSchema: null,
      proposedOverrides: null,
      message: null,
    });

    const proposal3Id = createConfigVariantProposalId();
    await fixture.engine.testing.configVariantProposals.create({
      id: proposal3Id,
      configVariantId,
      baseVariantVersion: variant.version,
      proposerId: TEST_USER_ID,
      createdAt: fixture.now,
      rejectedAt: null,
      approvedAt: null,
      reviewerId: null,
      rejectedInFavorOfProposalId: null,
      rejectionReason: null,
      proposedValue: null,
      proposedSchema: {type: 'object', properties: {enabled: {type: 'boolean'}}},
      proposedOverrides: null,
      message: null,
    });

    // Verify all proposals are pending
    const pendingBefore =
      await fixture.engine.testing.configVariantProposals.getPendingByConfigVariantId(
        configVariantId,
      );
    expect(pendingBefore).toHaveLength(3);

    // Reject all pending proposals
    await fixture.engine.useCases.rejectAllPendingConfigVariantProposals(GLOBAL_CONTEXT, {
      configVariantId,
      currentUserEmail: CURRENT_USER_EMAIL,
    });

    // Verify all proposals are rejected
    const proposal1 = await fixture.engine.testing.configVariantProposals.getById(proposal1Id);
    const proposal2 = await fixture.engine.testing.configVariantProposals.getById(proposal2Id);
    const proposal3 = await fixture.engine.testing.configVariantProposals.getById(proposal3Id);

    assert(proposal1 && proposal2 && proposal3);
    expect(proposal1.rejectedAt).toBeDefined();
    expect(proposal1.approvedAt).toBeNull();
    expect(proposal1.reviewerId).toBe(TEST_USER_ID);
    expect(proposal1.rejectionReason).toBe('rejected_explicitly');

    expect(proposal2.rejectedAt).toBeDefined();
    expect(proposal2.approvedAt).toBeNull();
    expect(proposal2.reviewerId).toBe(TEST_USER_ID);
    expect(proposal2.rejectionReason).toBe('rejected_explicitly');

    expect(proposal3.rejectedAt).toBeDefined();
    expect(proposal3.approvedAt).toBeNull();
    expect(proposal3.reviewerId).toBe(TEST_USER_ID);
    expect(proposal3.rejectionReason).toBe('rejected_explicitly');

    // Verify no pending proposals remain
    const pendingAfter =
      await fixture.engine.testing.configVariantProposals.getPendingByConfigVariantId(
        configVariantId,
      );
    expect(pendingAfter).toHaveLength(0);
  });

  it('should handle proposals with different change types', async () => {
    const {configVariantId, variant} = await createConfigWithVariant();

    const newSchema = {
      type: 'object',
      properties: {
        enabled: {type: 'boolean'},
        threshold: {type: 'number'},
      },
    };

    const newOverrides = [
      {
        name: 'Test Override',
        conditions: [
          {
            operator: 'equals' as const,
            property: 'region',
            value: {type: 'literal' as const, value: 'US'},
          },
        ],
        value: {enabled: true},
      },
    ];

    // Value proposal
    const valueProposalId = createConfigVariantProposalId();
    await fixture.engine.testing.configVariantProposals.create({
      id: valueProposalId,
      configVariantId,
      baseVariantVersion: variant.version,
      proposerId: OTHER_USER_ID,
      createdAt: fixture.now,
      rejectedAt: null,
      approvedAt: null,
      reviewerId: null,
      rejectedInFavorOfProposalId: null,
      rejectionReason: null,
      proposedValue: {enabled: true},
      proposedSchema: null,
      proposedOverrides: null,
      message: null,
    });

    // Schema proposal
    const schemaProposalId = createConfigVariantProposalId();
    await fixture.engine.testing.configVariantProposals.create({
      id: schemaProposalId,
      configVariantId,
      baseVariantVersion: variant.version,
      proposerId: OTHER_USER_ID,
      createdAt: fixture.now,
      rejectedAt: null,
      approvedAt: null,
      reviewerId: null,
      rejectedInFavorOfProposalId: null,
      rejectionReason: null,
      proposedValue: null,
      proposedSchema: newSchema,
      proposedOverrides: null,
      message: null,
    });

    // Overrides proposal
    const overridesProposalId = createConfigVariantProposalId();
    await fixture.engine.testing.configVariantProposals.create({
      id: overridesProposalId,
      configVariantId,
      baseVariantVersion: variant.version,
      proposerId: OTHER_USER_ID,
      createdAt: fixture.now,
      rejectedAt: null,
      approvedAt: null,
      reviewerId: null,
      rejectedInFavorOfProposalId: null,
      rejectionReason: null,
      proposedValue: null,
      proposedSchema: null,
      proposedOverrides: newOverrides,
      message: null,
    });

    await fixture.engine.useCases.rejectAllPendingConfigVariantProposals(GLOBAL_CONTEXT, {
      configVariantId,
      currentUserEmail: CURRENT_USER_EMAIL,
    });

    // Verify all proposals are rejected
    const valueProposal =
      await fixture.engine.testing.configVariantProposals.getById(valueProposalId);
    const schemaProposal =
      await fixture.engine.testing.configVariantProposals.getById(schemaProposalId);
    const overridesProposal =
      await fixture.engine.testing.configVariantProposals.getById(overridesProposalId);

    assert(valueProposal && schemaProposal && overridesProposal);
    expect(valueProposal.rejectedAt).toBeDefined();
    expect(schemaProposal.rejectedAt).toBeDefined();
    expect(overridesProposal.rejectedAt).toBeDefined();
  });

  it('should return successfully when there are no pending proposals', async () => {
    const {configVariantId} = await createConfigWithVariant();

    // Should not throw when there are no pending proposals
    await fixture.engine.useCases.rejectAllPendingConfigVariantProposals(GLOBAL_CONTEXT, {
      configVariantId,
      currentUserEmail: CURRENT_USER_EMAIL,
    });

    // Verify no proposals exist
    const pendingAfter =
      await fixture.engine.testing.configVariantProposals.getPendingByConfigVariantId(
        configVariantId,
      );
    expect(pendingAfter).toHaveLength(0);
  });

  it('should throw BadRequestError when config variant does not exist', async () => {
    const nonExistentVariantId = createUuidV4();

    await expect(
      fixture.engine.useCases.rejectAllPendingConfigVariantProposals(GLOBAL_CONTEXT, {
        configVariantId: nonExistentVariantId,
        currentUserEmail: CURRENT_USER_EMAIL,
      }),
    ).rejects.toThrow(BadRequestError);
  });

  it('should skip already approved proposals', async () => {
    const {configVariantId, variant} = await createConfigWithVariant();

    // Create two proposals
    const proposal1Id = createConfigVariantProposalId();
    await fixture.engine.testing.configVariantProposals.create({
      id: proposal1Id,
      configVariantId,
      baseVariantVersion: variant.version,
      proposerId: OTHER_USER_ID,
      createdAt: fixture.now,
      rejectedAt: null,
      approvedAt: fixture.now, // Already approved
      reviewerId: TEST_USER_ID,
      rejectedInFavorOfProposalId: null,
      rejectionReason: null,
      proposedValue: {enabled: true},
      proposedSchema: null,
      proposedOverrides: null,
      message: null,
    });

    const proposal2Id = createConfigVariantProposalId();
    await fixture.engine.testing.configVariantProposals.create({
      id: proposal2Id,
      configVariantId,
      baseVariantVersion: variant.version,
      proposerId: OTHER_USER_ID,
      createdAt: fixture.now,
      rejectedAt: null,
      approvedAt: null, // Pending
      reviewerId: null,
      rejectedInFavorOfProposalId: null,
      rejectionReason: null,
      proposedValue: {count: 42},
      proposedSchema: null,
      proposedOverrides: null,
      message: null,
    });

    // Reject all pending proposals (should only reject proposal 2)
    await fixture.engine.useCases.rejectAllPendingConfigVariantProposals(GLOBAL_CONTEXT, {
      configVariantId,
      currentUserEmail: CURRENT_USER_EMAIL,
    });

    // Verify proposal 1 is still approved
    const proposal1 = await fixture.engine.testing.configVariantProposals.getById(proposal1Id);
    assert(proposal1);
    expect(proposal1.approvedAt).toBeDefined();
    expect(proposal1.rejectedAt).toBeNull();

    // Verify proposal 2 is rejected
    const proposal2 = await fixture.engine.testing.configVariantProposals.getById(proposal2Id);
    assert(proposal2);
    expect(proposal2.rejectedAt).toBeDefined();
    expect(proposal2.approvedAt).toBeNull();
  });

  it('should skip already rejected proposals', async () => {
    const {configVariantId, variant} = await createConfigWithVariant();

    // Create two proposals
    const proposal1Id = createConfigVariantProposalId();
    await fixture.engine.testing.configVariantProposals.create({
      id: proposal1Id,
      configVariantId,
      baseVariantVersion: variant.version,
      proposerId: OTHER_USER_ID,
      createdAt: fixture.now,
      rejectedAt: fixture.now, // Already rejected
      approvedAt: null,
      reviewerId: TEST_USER_ID,
      rejectedInFavorOfProposalId: null,
      rejectionReason: 'rejected_explicitly',
      proposedValue: {enabled: true},
      proposedSchema: null,
      proposedOverrides: null,
      message: null,
    });

    const proposal2Id = createConfigVariantProposalId();
    await fixture.engine.testing.configVariantProposals.create({
      id: proposal2Id,
      configVariantId,
      baseVariantVersion: variant.version,
      proposerId: OTHER_USER_ID,
      createdAt: fixture.now,
      rejectedAt: null, // Pending
      approvedAt: null,
      reviewerId: null,
      rejectedInFavorOfProposalId: null,
      rejectionReason: null,
      proposedValue: {count: 42},
      proposedSchema: null,
      proposedOverrides: null,
      message: null,
    });

    // Reject all pending proposals (should only reject proposal 2)
    await fixture.engine.useCases.rejectAllPendingConfigVariantProposals(GLOBAL_CONTEXT, {
      configVariantId,
      currentUserEmail: CURRENT_USER_EMAIL,
    });

    // Verify proposal 1 is still rejected (not double-rejected)
    const proposal1 = await fixture.engine.testing.configVariantProposals.getById(proposal1Id);
    assert(proposal1);
    expect(proposal1.rejectedAt).toBeDefined();

    // Verify proposal 2 is rejected
    const proposal2 = await fixture.engine.testing.configVariantProposals.getById(proposal2Id);
    assert(proposal2);
    expect(proposal2.rejectedAt).toBeDefined();
  });

  it('should only reject proposals for the specified variant', async () => {
    const {configId, configVariantId: variant1Id, variant: variant1} = await createConfigWithVariant();

    // Get the second variant (Development environment)
    const variants = await fixture.engine.testing.configVariants.getByConfigId(configId);
    const variant2 = variants.find(v => v.id !== variant1Id);
    assert(variant2, 'Second variant should exist');
    const variant2Id = variant2.id;

    // Create proposals for variant 1
    const variant1ProposalId = createConfigVariantProposalId();
    await fixture.engine.testing.configVariantProposals.create({
      id: variant1ProposalId,
      configVariantId: variant1Id,
      baseVariantVersion: variant1.version,
      proposerId: OTHER_USER_ID,
      createdAt: fixture.now,
      rejectedAt: null,
      approvedAt: null,
      reviewerId: null,
      rejectedInFavorOfProposalId: null,
      rejectionReason: null,
      proposedValue: {enabled: true},
      proposedSchema: null,
      proposedOverrides: null,
      message: null,
    });

    // Create proposals for variant 2
    const variant2ProposalId = createConfigVariantProposalId();
    await fixture.engine.testing.configVariantProposals.create({
      id: variant2ProposalId,
      configVariantId: variant2Id,
      baseVariantVersion: variant2.version,
      proposerId: OTHER_USER_ID,
      createdAt: fixture.now,
      rejectedAt: null,
      approvedAt: null,
      reviewerId: null,
      rejectedInFavorOfProposalId: null,
      rejectionReason: null,
      proposedValue: {count: 42},
      proposedSchema: null,
      proposedOverrides: null,
      message: null,
    });

    // Reject all pending proposals for variant 1 only
    await fixture.engine.useCases.rejectAllPendingConfigVariantProposals(GLOBAL_CONTEXT, {
      configVariantId: variant1Id,
      currentUserEmail: CURRENT_USER_EMAIL,
    });

    // Verify variant 1 proposal is rejected
    const variant1Proposal =
      await fixture.engine.testing.configVariantProposals.getById(variant1ProposalId);
    assert(variant1Proposal);
    expect(variant1Proposal.rejectedAt).toBeDefined();

    // Verify variant 2 proposal is still pending
    const variant2Proposal =
      await fixture.engine.testing.configVariantProposals.getById(variant2ProposalId);
    assert(variant2Proposal);
    expect(variant2Proposal.rejectedAt).toBeNull();
    expect(variant2Proposal.approvedAt).toBeNull();
  });

  it('should handle multiple proposals from different users', async () => {
    const {configVariantId, variant} = await createConfigWithVariant();

    // Create proposals from different users
    const proposal1Id = createConfigVariantProposalId();
    await fixture.engine.testing.configVariantProposals.create({
      id: proposal1Id,
      configVariantId,
      baseVariantVersion: variant.version,
      proposerId: TEST_USER_ID,
      createdAt: fixture.now,
      rejectedAt: null,
      approvedAt: null,
      reviewerId: null,
      rejectedInFavorOfProposalId: null,
      rejectionReason: null,
      proposedValue: {enabled: true},
      proposedSchema: null,
      proposedOverrides: null,
      message: 'Proposal from user 1',
    });

    const proposal2Id = createConfigVariantProposalId();
    await fixture.engine.testing.configVariantProposals.create({
      id: proposal2Id,
      configVariantId,
      baseVariantVersion: variant.version,
      proposerId: OTHER_USER_ID,
      createdAt: fixture.now,
      rejectedAt: null,
      approvedAt: null,
      reviewerId: null,
      rejectedInFavorOfProposalId: null,
      rejectionReason: null,
      proposedValue: {count: 42},
      proposedSchema: null,
      proposedOverrides: null,
      message: 'Proposal from user 2',
    });

    const proposal3Id = createConfigVariantProposalId();
    await fixture.engine.testing.configVariantProposals.create({
      id: proposal3Id,
      configVariantId,
      baseVariantVersion: variant.version,
      proposerId: THIRD_USER_ID,
      createdAt: fixture.now,
      rejectedAt: null,
      approvedAt: null,
      reviewerId: null,
      rejectedInFavorOfProposalId: null,
      rejectionReason: null,
      proposedValue: null,
      proposedSchema: {type: 'object'},
      proposedOverrides: null,
      message: 'Proposal from user 3',
    });

    await fixture.engine.useCases.rejectAllPendingConfigVariantProposals(GLOBAL_CONTEXT, {
      configVariantId,
      currentUserEmail: CURRENT_USER_EMAIL,
    });

    // All proposals should be rejected with the same reviewer
    const proposal1 = await fixture.engine.testing.configVariantProposals.getById(proposal1Id);
    const proposal2 = await fixture.engine.testing.configVariantProposals.getById(proposal2Id);
    const proposal3 = await fixture.engine.testing.configVariantProposals.getById(proposal3Id);

    assert(proposal1 && proposal2 && proposal3);
    expect(proposal1.rejectedAt).toBeDefined();
    expect(proposal1.reviewerId).toBe(TEST_USER_ID);
    expect(proposal2.rejectedAt).toBeDefined();
    expect(proposal2.reviewerId).toBe(TEST_USER_ID);
    expect(proposal3.rejectedAt).toBeDefined();
    expect(proposal3.reviewerId).toBe(TEST_USER_ID);
  });
});

