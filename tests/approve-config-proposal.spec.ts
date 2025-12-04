import {GLOBAL_CONTEXT} from '@/engine/core/context';
import {BadRequestError, ForbiddenError} from '@/engine/core/errors';
import type {ConfigProposalApprovedAuditLogPayload} from '@/engine/core/stores/audit-log-store';
import {normalizeEmail} from '@/engine/core/utils';
import {createUuidV4} from '@/engine/core/uuid';
import {beforeEach, describe, expect, it} from 'vitest';
import {useAppFixture} from './fixtures/trpc-fixture';

const CURRENT_USER_EMAIL = normalizeEmail('test@example.com');
const OTHER_USER_EMAIL = normalizeEmail('other@example.com');
const THIRD_USER_EMAIL = normalizeEmail('third@example.com');
const NON_MEMBER_USER_EMAIL = normalizeEmail('non-member@example.com');

const OTHER_USER_ID = 2;
const THIRD_USER_ID = 3;
const NON_MEMBER_USER_ID = 4;
describe('approveConfigProposal', () => {
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

  it('should approve a proposal with proposed description only', async () => {
    const {configId} = await fixture.createConfig({
      overrides: [],
      name: 'approve_description_only',
      value: {x: 1},
      schema: null,
      description: 'Old description',
      currentUserEmail: CURRENT_USER_EMAIL,
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
        {environmentId: fixture.productionEnvironmentId, value: {x: 1}, schema: null, overrides: []},
        {environmentId: fixture.developmentEnvironmentId, value: {x: 1}, schema: null, overrides: []},
      ],
      currentUserEmail: CURRENT_USER_EMAIL,
    });

    await fixture.engine.useCases.approveConfigProposal(GLOBAL_CONTEXT, {
      projectId: fixture.projectId,
      proposalId: configProposalId,
      currentUserEmail: OTHER_USER_EMAIL,
    });

    const {config} = await fixture.trpc.getConfig({
      name: 'approve_description_only',
      projectId: fixture.projectId,
    });

    expect(config?.config.description).toBe('New description');
    expect(config?.config.version).toBe(2);
  });

  it('should approve a proposal with member changes', async () => {
    const {configId} = await fixture.createConfig({
      overrides: [],
      name: 'approve_members',
      value: 'test',
      schema: null,
      description: 'Test',
      currentUserEmail: CURRENT_USER_EMAIL,
      editorEmails: [],
      maintainerEmails: [CURRENT_USER_EMAIL, OTHER_USER_EMAIL],
      projectId: fixture.projectId,
    });

    const newMemberEmail = normalizeEmail('newmember@example.com');
    const {configProposalId} = await fixture.engine.useCases.createConfigProposal(GLOBAL_CONTEXT, {
      projectId: fixture.projectId,
      baseVersion: 1,
      configId,
      description: 'Test',
      editorEmails: [newMemberEmail],
      maintainerEmails: [],
      environmentVariants: [
        {environmentId: fixture.productionEnvironmentId, value: 'test', schema: null, overrides: []},
        {environmentId: fixture.developmentEnvironmentId, value: 'test', schema: null, overrides: []},
      ],
      currentUserEmail: CURRENT_USER_EMAIL,
    });

    await fixture.engine.useCases.approveConfigProposal(GLOBAL_CONTEXT, {
      projectId: fixture.projectId,
      proposalId: configProposalId,
      currentUserEmail: OTHER_USER_EMAIL,
    });

    const {config} = await fixture.trpc.getConfig({
      name: 'approve_members',
      projectId: fixture.projectId,
    });

    expect(config?.editorEmails).toContain(newMemberEmail);
  });

  it('should approve a deletion proposal', async () => {
    const {configId} = await fixture.createConfig({
      overrides: [],
      name: 'approve_deletion',
      value: {x: 1},
      schema: null,
      description: 'To be deleted',
      currentUserEmail: CURRENT_USER_EMAIL,
      editorEmails: [],
      maintainerEmails: [CURRENT_USER_EMAIL, OTHER_USER_EMAIL],
      projectId: fixture.projectId,
    });

    const {configProposalId} = await fixture.engine.useCases.createConfigProposal(GLOBAL_CONTEXT, {
      projectId: fixture.projectId,
      baseVersion: 1,
      configId,
      proposedDelete: true,
      currentUserEmail: CURRENT_USER_EMAIL,
    });

    await fixture.engine.useCases.approveConfigProposal(GLOBAL_CONTEXT, {
      projectId: fixture.projectId,
      proposalId: configProposalId,
      currentUserEmail: OTHER_USER_EMAIL,
    });

    // Config should be deleted
    const {config} = await fixture.trpc.getConfig({
      name: 'approve_deletion',
      projectId: fixture.projectId,
    });
    expect(config).toBeUndefined();
  });

  it('should reject other pending proposals when approving', async () => {
    const {configId} = await fixture.createConfig({
      overrides: [],
      name: 'reject_others_on_approve',
      value: {x: 1},
      schema: null,
      description: 'Initial',
      currentUserEmail: CURRENT_USER_EMAIL,
      editorEmails: [],
      maintainerEmails: [CURRENT_USER_EMAIL, OTHER_USER_EMAIL, THIRD_USER_EMAIL],
      projectId: fixture.projectId,
    });

    // Create two proposals
    const {configProposalId: proposal1} = await fixture.engine.useCases.createConfigProposal(
      GLOBAL_CONTEXT,
      {
        projectId: fixture.projectId,
        baseVersion: 1,
        configId,
        description: 'Proposal 1',
        editorEmails: [],
        maintainerEmails: [CURRENT_USER_EMAIL, OTHER_USER_EMAIL, THIRD_USER_EMAIL],
        environmentVariants: [
          {environmentId: fixture.productionEnvironmentId, value: {x: 1}, schema: null, overrides: []},
          {environmentId: fixture.developmentEnvironmentId, value: {x: 1}, schema: null, overrides: []},
        ],
        currentUserEmail: CURRENT_USER_EMAIL,
      },
    );

    const {configProposalId: proposal2} = await fixture.engine.useCases.createConfigProposal(
      GLOBAL_CONTEXT,
      {
        projectId: fixture.projectId,
        baseVersion: 1,
        configId,
        description: 'Proposal 2',
        editorEmails: [],
        maintainerEmails: [CURRENT_USER_EMAIL, OTHER_USER_EMAIL, THIRD_USER_EMAIL],
        environmentVariants: [
          {environmentId: fixture.productionEnvironmentId, value: {x: 1}, schema: null, overrides: []},
          {environmentId: fixture.developmentEnvironmentId, value: {x: 1}, schema: null, overrides: []},
        ],
        currentUserEmail: THIRD_USER_EMAIL,
      },
    );

    // Approve proposal 1
    await fixture.engine.useCases.approveConfigProposal(GLOBAL_CONTEXT, {
      projectId: fixture.projectId,
      proposalId: proposal1,
      currentUserEmail: OTHER_USER_EMAIL,
    });

    // Proposal 2 should be rejected
    const rejectedProposal = await fixture.engine.testing.configProposals.getById({
      id: proposal2,
      projectId: fixture.projectId,
    });
    expect(rejectedProposal?.rejectedAt).not.toBeNull();
    expect(rejectedProposal?.rejectionReason).toBe('another_proposal_approved');
    expect(rejectedProposal?.rejectedInFavorOfProposalId).toBe(proposal1);
  });

  it('should throw BadRequestError for non-existent proposal', async () => {
    await expect(
      fixture.engine.useCases.approveConfigProposal(GLOBAL_CONTEXT, {
        projectId: fixture.projectId,
        proposalId: createUuidV4(),
        currentUserEmail: CURRENT_USER_EMAIL,
      }),
    ).rejects.toBeInstanceOf(BadRequestError);
  });

  it('should throw BadRequestError for already approved proposal', async () => {
    const {configId} = await fixture.createConfig({
      overrides: [],
      name: 'already_approved',
      value: 'test',
      schema: null,
      description: 'Test',
      currentUserEmail: CURRENT_USER_EMAIL,
      editorEmails: [],
      maintainerEmails: [CURRENT_USER_EMAIL, OTHER_USER_EMAIL],
      projectId: fixture.projectId,
    });

    const {configProposalId} = await fixture.engine.useCases.createConfigProposal(GLOBAL_CONTEXT, {
      projectId: fixture.projectId,
      baseVersion: 1,
      configId,
      description: 'Updated',
      editorEmails: [],
      maintainerEmails: [CURRENT_USER_EMAIL, OTHER_USER_EMAIL],
      environmentVariants: [
        {environmentId: fixture.productionEnvironmentId, value: 'test', schema: null, overrides: []},
        {environmentId: fixture.developmentEnvironmentId, value: 'test', schema: null, overrides: []},
      ],
      currentUserEmail: CURRENT_USER_EMAIL,
    });

    await fixture.engine.useCases.approveConfigProposal(GLOBAL_CONTEXT, {
      projectId: fixture.projectId,
      proposalId: configProposalId,
      currentUserEmail: OTHER_USER_EMAIL,
    });

    await expect(
      fixture.engine.useCases.approveConfigProposal(GLOBAL_CONTEXT, {
        projectId: fixture.projectId,
        proposalId: configProposalId,
        currentUserEmail: OTHER_USER_EMAIL,
      }),
    ).rejects.toBeInstanceOf(BadRequestError);
  });

  it('should throw BadRequestError for already rejected proposal', async () => {
    const {configId} = await fixture.createConfig({
      overrides: [],
      name: 'already_rejected',
      value: 'test',
      schema: null,
      description: 'Test',
      currentUserEmail: CURRENT_USER_EMAIL,
      editorEmails: [],
      maintainerEmails: [CURRENT_USER_EMAIL, OTHER_USER_EMAIL],
      projectId: fixture.projectId,
    });

    const {configProposalId} = await fixture.engine.useCases.createConfigProposal(GLOBAL_CONTEXT, {
      projectId: fixture.projectId,
      baseVersion: 1,
      configId,
      description: 'Updated',
      editorEmails: [],
      maintainerEmails: [CURRENT_USER_EMAIL, OTHER_USER_EMAIL],
      environmentVariants: [
        {environmentId: fixture.productionEnvironmentId, value: 'test', schema: null, overrides: []},
        {environmentId: fixture.developmentEnvironmentId, value: 'test', schema: null, overrides: []},
      ],
      currentUserEmail: CURRENT_USER_EMAIL,
    });

    await fixture.engine.useCases.rejectConfigProposal(GLOBAL_CONTEXT, {
      projectId: fixture.projectId,
      proposalId: configProposalId,
      currentUserEmail: OTHER_USER_EMAIL,
    });

    await expect(
      fixture.engine.useCases.approveConfigProposal(GLOBAL_CONTEXT, {
        projectId: fixture.projectId,
        proposalId: configProposalId,
        currentUserEmail: OTHER_USER_EMAIL,
      }),
    ).rejects.toBeInstanceOf(BadRequestError);
  });

  it('should create audit message for approval', async () => {
    const {configId} = await fixture.createConfig({
      overrides: [],
      name: 'audit_approve',
      value: 'test',
      schema: null,
      description: 'Initial',
      currentUserEmail: CURRENT_USER_EMAIL,
      editorEmails: [],
      maintainerEmails: [CURRENT_USER_EMAIL, OTHER_USER_EMAIL],
      projectId: fixture.projectId,
    });

    const {configProposalId} = await fixture.engine.useCases.createConfigProposal(GLOBAL_CONTEXT, {
      projectId: fixture.projectId,
      baseVersion: 1,
      configId,
      description: 'Approved description',
      editorEmails: [],
      maintainerEmails: [CURRENT_USER_EMAIL, OTHER_USER_EMAIL],
      environmentVariants: [
        {environmentId: fixture.productionEnvironmentId, value: 'test', schema: null, overrides: []},
        {environmentId: fixture.developmentEnvironmentId, value: 'test', schema: null, overrides: []},
      ],
      currentUserEmail: CURRENT_USER_EMAIL,
    });

    await fixture.engine.useCases.approveConfigProposal(GLOBAL_CONTEXT, {
      projectId: fixture.projectId,
      proposalId: configProposalId,
      currentUserEmail: OTHER_USER_EMAIL,
    });

    const messages = await fixture.engine.testing.auditLogs.list({
      lte: new Date('2100-01-01T00:00:00Z'),
      limit: 50,
      orderBy: 'created_at desc, id desc',
      projectId: fixture.projectId,
    });

    const approvalMessage = messages.find(
      (m: any) => m.payload.type === 'config_proposal_approved',
    );
    expect(approvalMessage).toBeDefined();
    expect((approvalMessage?.payload as ConfigProposalApprovedAuditLogPayload).proposalId).toBe(
      configProposalId,
    );
    expect((approvalMessage?.payload as ConfigProposalApprovedAuditLogPayload).configId).toBe(
      configId,
    );
  });

  it('should throw BadRequestError when config version has changed', async () => {
    const {configId} = await fixture.createConfig({
      overrides: [],
      name: 'version_conflict',
      value: 'test',
      schema: null,
      description: 'Initial',
      currentUserEmail: CURRENT_USER_EMAIL,
      editorEmails: [],
      maintainerEmails: [CURRENT_USER_EMAIL, OTHER_USER_EMAIL],
      projectId: fixture.projectId,
    });

    // Create proposal at version 1
    const {configProposalId} = await fixture.engine.useCases.createConfigProposal(GLOBAL_CONTEXT, {
      projectId: fixture.projectId,
      baseVersion: 1,
      configId,
      description: 'Proposed change',
      editorEmails: [],
      maintainerEmails: [CURRENT_USER_EMAIL, OTHER_USER_EMAIL],
      environmentVariants: [
        {environmentId: fixture.productionEnvironmentId, value: 'test', schema: null, overrides: []},
        {environmentId: fixture.developmentEnvironmentId, value: 'test', schema: null, overrides: []},
      ],
      currentUserEmail: OTHER_USER_EMAIL,
    });

    // Update config (version becomes 2)
    await fixture.engine.useCases.updateConfig(GLOBAL_CONTEXT, {
      configId,
      description: 'Direct update',
      editorEmails: [],
      maintainerEmails: [CURRENT_USER_EMAIL, OTHER_USER_EMAIL],
      environmentVariants: [
        {environmentId: fixture.productionEnvironmentId, value: 'test', schema: null, overrides: []},
        {environmentId: fixture.developmentEnvironmentId, value: 'test', schema: null, overrides: []},
      ],
      currentUserEmail: CURRENT_USER_EMAIL,
      prevVersion: 1,
    });

    // Trying to approve should fail due to version mismatch
    await expect(
      fixture.engine.useCases.approveConfigProposal(GLOBAL_CONTEXT, {
        projectId: fixture.projectId,
        proposalId: configProposalId,
        currentUserEmail: CURRENT_USER_EMAIL,
      }),
    ).rejects.toBeInstanceOf(BadRequestError);
  });

  it('should approve a proposal with variant value changes', async () => {
    const {configId, configVariantIds} = await fixture.createConfig({
      name: 'approve_variant_value',
      value: {enabled: true},
      schema: {type: 'object', properties: {enabled: {type: 'boolean'}}},
      overrides: [],
      description: 'Variant test',
      currentUserEmail: CURRENT_USER_EMAIL,
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
      description: 'Variant test',
      editorEmails: [],
      maintainerEmails: [CURRENT_USER_EMAIL, OTHER_USER_EMAIL],
      environmentVariants: [
        {environmentId: fixture.productionEnvironmentId, value: {enabled: false}, schema: {type: 'object', properties: {enabled: {type: 'boolean'}}}, overrides: []},
        {environmentId: fixture.developmentEnvironmentId, value: {enabled: true}, schema: {type: 'object', properties: {enabled: {type: 'boolean'}}}, overrides: []},
      ],
      currentUserEmail: CURRENT_USER_EMAIL,
    });

    await fixture.engine.useCases.approveConfigProposal(GLOBAL_CONTEXT, {
      projectId: fixture.projectId,
      proposalId: configProposalId,
      currentUserEmail: OTHER_USER_EMAIL,
    });

    // Verify the variant value was updated
    const updatedVariant = await fixture.engine.testing.configVariants.getById(prodVariantId!);
    expect(updatedVariant?.value).toEqual({enabled: false});
  });

  it('should approve a proposal with both config and variant changes', async () => {
    const {configId, configVariantIds} = await fixture.createConfig({
      name: 'approve_combined_changes',
      value: {count: 10},
      schema: {type: 'object', properties: {count: {type: 'number'}}},
      overrides: [],
      description: 'Original description',
      currentUserEmail: CURRENT_USER_EMAIL,
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
      description: 'Updated description',
      editorEmails: [],
      maintainerEmails: [CURRENT_USER_EMAIL, OTHER_USER_EMAIL],
      environmentVariants: [
        {environmentId: fixture.productionEnvironmentId, value: {count: 20}, schema: {type: 'object', properties: {count: {type: 'number'}}}, overrides: []},
        {environmentId: fixture.developmentEnvironmentId, value: {count: 10}, schema: {type: 'object', properties: {count: {type: 'number'}}}, overrides: []},
      ],
      currentUserEmail: CURRENT_USER_EMAIL,
    });

    await fixture.engine.useCases.approveConfigProposal(GLOBAL_CONTEXT, {
      projectId: fixture.projectId,
      proposalId: configProposalId,
      currentUserEmail: OTHER_USER_EMAIL,
    });

    // Verify config description was updated
    const {config} = await fixture.trpc.getConfig({
      name: 'approve_combined_changes',
      projectId: fixture.projectId,
    });
    expect(config?.config.description).toBe('Updated description');

    // Verify variant value was updated
    const updatedVariant = await fixture.engine.testing.configVariants.getById(prodVariantId!);
    expect(updatedVariant?.value).toEqual({count: 20});
  });

  it('should not allow non-member user to approve', async () => {
    const {configId} = await fixture.createConfig({
      overrides: [],
      name: 'non_member_approve',
      value: 'test',
      schema: null,
      description: 'Test',
      currentUserEmail: CURRENT_USER_EMAIL,
      editorEmails: [],
      maintainerEmails: [CURRENT_USER_EMAIL],
      projectId: fixture.projectId,
    });

    const {configProposalId} = await fixture.engine.useCases.createConfigProposal(GLOBAL_CONTEXT, {
      projectId: fixture.projectId,
      baseVersion: 1,
      configId,
      description: 'Non-member proposed',
      editorEmails: [],
      maintainerEmails: [CURRENT_USER_EMAIL],
      environmentVariants: [
        {environmentId: fixture.productionEnvironmentId, value: 'test', schema: null, overrides: []},
        {environmentId: fixture.developmentEnvironmentId, value: 'test', schema: null, overrides: []},
      ],
      currentUserEmail: CURRENT_USER_EMAIL,
    });

    await expect(
      fixture.engine.useCases.approveConfigProposal(GLOBAL_CONTEXT, {
        projectId: fixture.projectId,
        proposalId: configProposalId,
        currentUserEmail: NON_MEMBER_USER_EMAIL,
      }),
    ).rejects.toBeInstanceOf(ForbiddenError);
  });
});

describe('approveConfigProposal (allowSelfApprovals=false)', () => {
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
    // Set allowSelfApprovals to false on the project
    await fixture.engine.useCases.patchProject(GLOBAL_CONTEXT, {
      id: fixture.projectId,
      details: {
        name: 'Test Project',
        description: 'Default project for tests',
        requireProposals: false,
        allowSelfApprovals: false,
      },
      currentUserEmail: CURRENT_USER_EMAIL,
    });
  });

  it('should prevent self-approval when allowSelfApprovals is false', async () => {
    const {configId} = await fixture.createConfig({
      overrides: [],
      name: 'no_self_approve',
      value: 'test',
      schema: null,
      description: 'Test',
      currentUserEmail: CURRENT_USER_EMAIL,
      editorEmails: [],
      maintainerEmails: [CURRENT_USER_EMAIL, OTHER_USER_EMAIL],
      projectId: fixture.projectId,
    });

    const {configProposalId} = await fixture.engine.useCases.createConfigProposal(GLOBAL_CONTEXT, {
      projectId: fixture.projectId,
      baseVersion: 1,
      configId,
      description: 'Self proposed',
      editorEmails: [],
      maintainerEmails: [CURRENT_USER_EMAIL, OTHER_USER_EMAIL],
      environmentVariants: [
        {environmentId: fixture.productionEnvironmentId, value: 'test', schema: null, overrides: []},
        {environmentId: fixture.developmentEnvironmentId, value: 'test', schema: null, overrides: []},
      ],
      currentUserEmail: CURRENT_USER_EMAIL,
    });

    // Self-approval should be forbidden
    await expect(
      fixture.engine.useCases.approveConfigProposal(GLOBAL_CONTEXT, {
        projectId: fixture.projectId,
        proposalId: configProposalId,
        currentUserEmail: CURRENT_USER_EMAIL, // Same user who proposed
      }),
    ).rejects.toBeInstanceOf(ForbiddenError);

    // Approval by another user should work
    await fixture.engine.useCases.approveConfigProposal(GLOBAL_CONTEXT, {
      projectId: fixture.projectId,
      proposalId: configProposalId,
      currentUserEmail: OTHER_USER_EMAIL,
    });

    const {config} = await fixture.trpc.getConfig({
      name: 'no_self_approve',
      projectId: fixture.projectId,
    });
    expect(config?.config.description).toBe('Self proposed');
  });
});

describe('approveConfigProposal (allowSelfApprovals=true)', () => {
  const fixture = useAppFixture({authEmail: CURRENT_USER_EMAIL});

  it('should allow self-approval when allowSelfApprovals is true', async () => {
    // Update project to allow self-approvals
    await fixture.engine.useCases.patchProject(GLOBAL_CONTEXT, {
      id: fixture.projectId,
      details: {
        name: 'Test Project',
        description: 'Default project for tests',
        requireProposals: false,
        allowSelfApprovals: true,
      },
      currentUserEmail: CURRENT_USER_EMAIL,
    });

    const {configId} = await fixture.createConfig({
      overrides: [],
      name: 'self_approve_allowed',
      value: 'test',
      schema: null,
      description: 'Test',
      currentUserEmail: CURRENT_USER_EMAIL,
      editorEmails: [],
      maintainerEmails: [CURRENT_USER_EMAIL],
      projectId: fixture.projectId,
    });

    const {configProposalId} = await fixture.engine.useCases.createConfigProposal(GLOBAL_CONTEXT, {
      projectId: fixture.projectId,
      baseVersion: 1,
      configId,
      description: 'Self approved',
      editorEmails: [],
      maintainerEmails: [CURRENT_USER_EMAIL],
      environmentVariants: [
        {environmentId: fixture.productionEnvironmentId, value: 'test', schema: null, overrides: []},
        {environmentId: fixture.developmentEnvironmentId, value: 'test', schema: null, overrides: []},
      ],
      currentUserEmail: CURRENT_USER_EMAIL,
    });

    // Self-approval should work
    await fixture.engine.useCases.approveConfigProposal(GLOBAL_CONTEXT, {
      projectId: fixture.projectId,
      proposalId: configProposalId,
      currentUserEmail: CURRENT_USER_EMAIL,
    });

    const {config} = await fixture.trpc.getConfig({
      name: 'self_approve_allowed',
      projectId: fixture.projectId,
    });
    expect(config?.config.description).toBe('Self approved');
  });
});
