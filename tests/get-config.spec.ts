import {GLOBAL_CONTEXT} from '@/engine/core/context';
import {normalizeEmail} from '@/engine/core/utils';
import {beforeEach, describe, expect, it} from 'vitest';
import {TEST_USER_ID, useAppFixture} from './fixtures/trpc-fixture';

const TEST_USER_EMAIL = normalizeEmail('test@example.com');
const OTHER_USER_EMAIL = normalizeEmail('other@example.com');
const THIRD_USER_EMAIL = normalizeEmail('third@example.com');

const OTHER_USER_ID = 2;
const THIRD_USER_ID = 3;

describe('getConfig', () => {
  const fixture = useAppFixture({authEmail: TEST_USER_EMAIL});

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

  it('should return requested config with variants', async () => {
    const {configId} = await fixture.engine.useCases.createConfig(GLOBAL_CONTEXT, {
      overrides: [],
      name: 'test-config',
      value: 'test-value',
      schema: {type: 'string'},
      description: 'A test config',
      currentUserEmail: TEST_USER_EMAIL,
      editorEmails: [],
      maintainerEmails: [],
      projectId: fixture.projectId,
    });

    await fixture.engine.useCases.patchProject(GLOBAL_CONTEXT, {
      currentUserEmail: TEST_USER_EMAIL,
      id: fixture.projectId,
      members: {users: [{email: 'some-other-user@example.com', role: 'admin'}]},
    });
    const {config} = await fixture.trpc.getConfig({
      name: 'test-config',
      projectId: fixture.projectId,
    });

    expect(config).toBeDefined();
    expect(config?.config.name).toBe('test-config');
    expect(config?.config.description).toBe('A test config');
    expect(config?.config.creatorId).toBe(TEST_USER_ID);
    expect(config?.config.id).toBe(configId);
    expect(config?.config.version).toBe(1);
    expect(config?.config.projectId).toBe(fixture.projectId);

    // Check variants
    expect(config?.variants).toHaveLength(2);
    const productionVariant = config?.variants.find(v => v.environmentName === 'Production');
    expect(productionVariant?.value).toBe('test-value');
    expect(productionVariant?.schema).toEqual({type: 'string'});
    expect(productionVariant?.overrides).toEqual([]);

    expect(config?.editorEmails).toEqual([]);
    expect(config?.maintainerEmails).toEqual([]);
    expect(config?.myRole).toBe('viewer');
    expect(config?.pendingConfigProposals).toEqual([]);
  });

  it('should return undefined if config does not exist', async () => {
    const {config} = await fixture.trpc.getConfig({
      name: 'non-existent-config',
      projectId: fixture.projectId,
    });

    expect(config).toBeUndefined();
  });

  it('should reflect owner role and owner/editor lists', async () => {
    await fixture.engine.useCases.createConfig(GLOBAL_CONTEXT, {
      overrides: [],
      name: 'owner-role-config',
      value: 'x',
      schema: {type: 'string'},
      description: 'Owner role',
      currentUserEmail: TEST_USER_EMAIL,
      editorEmails: ['editor@example.com'],
      maintainerEmails: [TEST_USER_EMAIL, 'owner2@example.com'],
      projectId: fixture.projectId,
    });
    const {config} = await fixture.trpc.getConfig({
      name: 'owner-role-config',
      projectId: fixture.projectId,
    });
    expect(config?.myRole).toBe('maintainer');
    expect(config?.maintainerEmails.sort()).toEqual(
      [
        TEST_USER_EMAIL,
        expect.any(String), // normalized email of owner2
      ].sort(),
    );
    expect(config?.editorEmails).toEqual(['editor@example.com']);
  });

  it('should reflect editor role', async () => {
    await fixture.engine.useCases.createConfig(GLOBAL_CONTEXT, {
      overrides: [],
      name: 'editor-role-config',
      value: 'x',
      schema: {type: 'string'},
      description: 'Editor role',
      currentUserEmail: TEST_USER_EMAIL,
      editorEmails: [TEST_USER_EMAIL],
      maintainerEmails: ['another-owner@example.com'],
      projectId: fixture.projectId,
    });

    await fixture.engine.useCases.patchProject(GLOBAL_CONTEXT, {
      currentUserEmail: TEST_USER_EMAIL,
      id: fixture.projectId,
      members: {users: [{email: 'some-other-user@example.com', role: 'admin'}]},
    });
    const {config} = await fixture.trpc.getConfig({
      name: 'editor-role-config',
      projectId: fixture.projectId,
    });
    expect(config?.myRole).toBe('editor');
    expect(config?.editorEmails).toContain(TEST_USER_EMAIL);
  });

  it('should reflect viewer role when not a member', async () => {
    await fixture.engine.useCases.createConfig(GLOBAL_CONTEXT, {
      overrides: [],
      name: 'viewer-role-config',
      value: 'x',
      schema: {type: 'string'},
      description: 'Viewer role',
      currentUserEmail: TEST_USER_EMAIL,
      editorEmails: [],
      maintainerEmails: ['different-owner@example.com'],
      projectId: fixture.projectId,
    });

    await fixture.engine.useCases.patchProject(GLOBAL_CONTEXT, {
      currentUserEmail: TEST_USER_EMAIL,
      id: fixture.projectId,
      members: {users: [{email: 'some-other-user@example.com', role: 'admin'}]},
    });
    const {config} = await fixture.trpc.getConfig({
      name: 'viewer-role-config',
      projectId: fixture.projectId,
    });
    expect(config?.myRole).toBe('viewer');
  });

  it('should include empty pending config proposals when no proposals exist', async () => {
    await fixture.engine.useCases.createConfig(GLOBAL_CONTEXT, {
      overrides: [],
      name: 'no-proposals-config',
      value: {enabled: false},
      schema: null,
      description: 'Config with no proposals',
      currentUserEmail: TEST_USER_EMAIL,
      editorEmails: [TEST_USER_EMAIL],
      maintainerEmails: [],
      projectId: fixture.projectId,
    });

    const {config} = await fixture.trpc.getConfig({
      name: 'no-proposals-config',
      projectId: fixture.projectId,
    });

    expect(config?.pendingConfigProposals).toEqual([]);
  });

  it('should include pending config proposals with proposer information', async () => {
    const {configId} = await fixture.engine.useCases.createConfig(GLOBAL_CONTEXT, {
      overrides: [],
      name: 'with-proposals-config',
      value: {enabled: false},
      schema: null,
      description: 'Config with proposals',
      currentUserEmail: TEST_USER_EMAIL,
      editorEmails: [],
      maintainerEmails: [TEST_USER_EMAIL, OTHER_USER_EMAIL],
      projectId: fixture.projectId,
    });

    // Create pending config-level proposal (description change)
    const {configProposalId} = await fixture.engine.useCases.createConfigProposal(GLOBAL_CONTEXT, {
      projectId: fixture.projectId,
      baseVersion: 1,
      configId,
      proposedDescription: {newDescription: 'Updated description'},
      currentUserEmail: OTHER_USER_EMAIL,
    });

    const {config} = await fixture.trpc.getConfig({
      name: 'with-proposals-config',
      projectId: fixture.projectId,
    });

    expect(config?.pendingConfigProposals).toHaveLength(1);
    expect(config?.pendingConfigProposals[0]).toMatchObject({
      id: configProposalId,
      proposerId: OTHER_USER_ID,
      proposerEmail: OTHER_USER_EMAIL,
      baseConfigVersion: 1,
    });
    expect(config?.pendingConfigProposals[0].createdAt).toBeDefined();
  });

  it('should include multiple pending config proposals', async () => {
    const {configId} = await fixture.engine.useCases.createConfig(GLOBAL_CONTEXT, {
      overrides: [],
      name: 'multiple-proposals-config',
      value: {enabled: false},
      schema: null,
      description: 'Config with multiple proposals',
      currentUserEmail: TEST_USER_EMAIL,
      editorEmails: [],
      maintainerEmails: [TEST_USER_EMAIL, OTHER_USER_EMAIL, THIRD_USER_EMAIL],
      projectId: fixture.projectId,
    });

    // Create multiple config-level proposals
    const {configProposalId: proposal1Id} = await fixture.engine.useCases.createConfigProposal(
      GLOBAL_CONTEXT,
      {
        projectId: fixture.projectId,
        baseVersion: 1,
        configId,
        proposedDescription: {newDescription: 'First description'},
        currentUserEmail: OTHER_USER_EMAIL,
      },
    );

    const {configProposalId: proposal2Id} = await fixture.engine.useCases.createConfigProposal(
      GLOBAL_CONTEXT,
      {
        projectId: fixture.projectId,
        baseVersion: 1,
        configId,
        proposedDescription: {newDescription: 'Second description'},
        currentUserEmail: THIRD_USER_EMAIL,
      },
    );

    const {config} = await fixture.trpc.getConfig({
      name: 'multiple-proposals-config',
      projectId: fixture.projectId,
    });

    expect(config?.pendingConfigProposals).toHaveLength(2);
    expect(
      config?.pendingConfigProposals.map(x => ({id: x.id, proposerEmail: x.proposerEmail})),
    ).toEqual(
      expect.arrayContaining([
        {id: proposal1Id, proposerEmail: OTHER_USER_EMAIL},
        {id: proposal2Id, proposerEmail: THIRD_USER_EMAIL},
      ]),
    );
  });

  it('should not include approved config proposals in pending list', async () => {
    const {configId} = await fixture.engine.useCases.createConfig(GLOBAL_CONTEXT, {
      overrides: [],
      name: 'approved-proposal-config',
      value: {enabled: false},
      schema: null,
      description: 'Config with approved proposal',
      currentUserEmail: TEST_USER_EMAIL,
      editorEmails: [],
      maintainerEmails: [TEST_USER_EMAIL, OTHER_USER_EMAIL],
      projectId: fixture.projectId,
    });

    // Create and approve a config-level proposal
    const {configProposalId} = await fixture.engine.useCases.createConfigProposal(GLOBAL_CONTEXT, {
      projectId: fixture.projectId,
      baseVersion: 1,
      configId,
      proposedDescription: {newDescription: 'Approved description'},
      currentUserEmail: OTHER_USER_EMAIL,
    });

    await fixture.engine.useCases.approveConfigProposal(GLOBAL_CONTEXT, {
      proposalId: configProposalId,
      currentUserEmail: TEST_USER_EMAIL,
      projectId: fixture.projectId,
    });

    const {config} = await fixture.trpc.getConfig({
      name: 'approved-proposal-config',
      projectId: fixture.projectId,
    });

    expect(config?.pendingConfigProposals).toEqual([]);
  });

  it('should not include rejected config proposals in pending list', async () => {
    const {configId} = await fixture.engine.useCases.createConfig(GLOBAL_CONTEXT, {
      overrides: [],
      name: 'rejected-proposal-config',
      value: {enabled: false},
      schema: null,
      description: 'Config with rejected proposal',
      currentUserEmail: TEST_USER_EMAIL,
      editorEmails: [],
      maintainerEmails: [TEST_USER_EMAIL, OTHER_USER_EMAIL],
      projectId: fixture.projectId,
    });

    // Create and reject a config-level proposal
    const {configProposalId} = await fixture.engine.useCases.createConfigProposal(GLOBAL_CONTEXT, {
      projectId: fixture.projectId,
      baseVersion: 1,
      configId,
      proposedDescription: {newDescription: 'Rejected description'},
      currentUserEmail: OTHER_USER_EMAIL,
    });

    await fixture.engine.useCases.rejectConfigProposal(GLOBAL_CONTEXT, {
      proposalId: configProposalId,
      projectId: fixture.projectId,
      currentUserEmail: TEST_USER_EMAIL,
    });

    const {config} = await fixture.trpc.getConfig({
      name: 'rejected-proposal-config',
      projectId: fixture.projectId,
    });

    expect(config?.pendingConfigProposals).toEqual([]);
  });

  it('should show only pending config proposals when both approved and pending exist', async () => {
    const {configId} = await fixture.engine.useCases.createConfig(GLOBAL_CONTEXT, {
      overrides: [],
      name: 'mixed-proposals-config',
      value: {enabled: false},
      schema: null,
      description: 'Config with mixed proposals',
      currentUserEmail: TEST_USER_EMAIL,
      editorEmails: [],
      maintainerEmails: [TEST_USER_EMAIL, OTHER_USER_EMAIL, THIRD_USER_EMAIL],
      projectId: fixture.projectId,
    });

    // Create and approve first proposal
    const {configProposalId: approvedProposalId} =
      await fixture.engine.useCases.createConfigProposal(GLOBAL_CONTEXT, {
        projectId: fixture.projectId,
        baseVersion: 1,
        configId,
        proposedDescription: {newDescription: 'Approved description'},
        currentUserEmail: OTHER_USER_EMAIL,
      });

    await fixture.engine.useCases.approveConfigProposal(GLOBAL_CONTEXT, {
      proposalId: approvedProposalId,
      currentUserEmail: TEST_USER_EMAIL,
      projectId: fixture.projectId,
    });

    // Create pending proposal
    const {configProposalId: pendingProposalId} =
      await fixture.engine.useCases.createConfigProposal(GLOBAL_CONTEXT, {
        projectId: fixture.projectId,
        baseVersion: 2,
        configId,
        proposedDescription: {newDescription: 'Pending description'},
        currentUserEmail: THIRD_USER_EMAIL,
      });

    const {config} = await fixture.trpc.getConfig({
      name: 'mixed-proposals-config',
      projectId: fixture.projectId,
    });

    expect(config?.pendingConfigProposals).toHaveLength(1);
    expect(config?.pendingConfigProposals[0].id).toBe(pendingProposalId);
  });

  it('should handle pending config proposal with null proposerId', async () => {
    const {configId} = await fixture.engine.useCases.createConfig(GLOBAL_CONTEXT, {
      overrides: [],
      name: 'null-proposer-config',
      value: {enabled: false},
      schema: null,
      description: 'Config with null proposer',
      currentUserEmail: TEST_USER_EMAIL,
      editorEmails: [],
      maintainerEmails: [TEST_USER_EMAIL, OTHER_USER_EMAIL],
      projectId: fixture.projectId,
    });

    // Create proposal
    const {configProposalId} = await fixture.engine.useCases.createConfigProposal(GLOBAL_CONTEXT, {
      projectId: fixture.projectId,
      baseVersion: 1,
      configId,
      proposedDescription: {newDescription: 'Some description'},
      currentUserEmail: OTHER_USER_EMAIL,
    });

    // Manually set proposerId to null (simulating deleted user)
    const connection = await fixture.engine.testing.pool.connect();
    try {
      await connection.query('UPDATE config_proposals SET proposer_id = NULL WHERE id = $1', [
        configProposalId,
      ]);
    } finally {
      connection.release();
    }

    const {config} = await fixture.trpc.getConfig({
      name: 'null-proposer-config',
      projectId: fixture.projectId,
    });

    expect(config?.pendingConfigProposals).toHaveLength(1);
    expect(config?.pendingConfigProposals[0]).toMatchObject({
      id: configProposalId,
      proposerId: null,
      proposerEmail: null,
    });
  });

  it('should include correct base config version for proposals', async () => {
    const {configId} = await fixture.engine.useCases.createConfig(GLOBAL_CONTEXT, {
      overrides: [],
      name: 'version-tracking-config',
      value: {enabled: false},
      schema: null,
      description: 'Config for version tracking',
      currentUserEmail: TEST_USER_EMAIL,
      editorEmails: [],
      maintainerEmails: [TEST_USER_EMAIL, OTHER_USER_EMAIL],
      projectId: fixture.projectId,
    });

    // Create and approve first proposal (bumps version to 2)
    const {configProposalId: firstProposalId} = await fixture.engine.useCases.createConfigProposal(
      GLOBAL_CONTEXT,
      {
        projectId: fixture.projectId,
        baseVersion: 1,
        configId,
        proposedDescription: {newDescription: 'First description'},
        currentUserEmail: OTHER_USER_EMAIL,
      },
    );

    await fixture.engine.useCases.approveConfigProposal(GLOBAL_CONTEXT, {
      proposalId: firstProposalId,
      currentUserEmail: TEST_USER_EMAIL,
      projectId: fixture.projectId,
    });

    // Create second proposal (should have baseConfigVersion = 2)
    const {configProposalId: secondProposalId} = await fixture.engine.useCases.createConfigProposal(
      GLOBAL_CONTEXT,
      {
        projectId: fixture.projectId,
        baseVersion: 2,
        configId,
        proposedDescription: {newDescription: 'Second description'},
        currentUserEmail: OTHER_USER_EMAIL,
      },
    );

    const {config} = await fixture.trpc.getConfig({
      name: 'version-tracking-config',
      projectId: fixture.projectId,
    });

    expect(config?.config.version).toBe(2);
    expect(config?.pendingConfigProposals).toHaveLength(1);
    expect(config?.pendingConfigProposals[0].baseConfigVersion).toBe(2);
    expect(config?.pendingConfigProposals[0].id).toBe(secondProposalId);
  });
});
