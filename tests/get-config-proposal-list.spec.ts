import {GLOBAL_CONTEXT} from '@/engine/core/context';
import {normalizeEmail} from '@/engine/core/utils';
import {beforeEach, describe, expect, it} from 'vitest';
import {useAppFixture} from './fixtures/trpc-fixture';

const CURRENT_USER_EMAIL = normalizeEmail('test@example.com');
const OTHER_USER_EMAIL = normalizeEmail('other@example.com');

const OTHER_USER_ID = 2;

function d(iso: string) {
  return new Date(iso);
}

describe('getConfigProposalList', () => {
  const fixture = useAppFixture({authEmail: CURRENT_USER_EMAIL});

  beforeEach(async () => {
    // Insert an additional user used as reviewer/approver
    const connection = await fixture.engine.testing.pool.connect();
    try {
      await connection.query(
        `INSERT INTO users(id, name, email, "emailVerified") VALUES ($1, 'Other', $2, NOW())`,
        [OTHER_USER_ID, OTHER_USER_EMAIL],
      );
    } finally {
      connection.release();
    }
  });

  it('supports filtering by configIds, proposalIds, statuses, and date ranges', async () => {
    // Times
    const T1 = d('2020-01-01T01:00:00Z');
    const T2 = d('2020-01-01T02:00:00Z');
    const T3 = d('2020-01-01T03:00:00Z');
    const T4 = d('2020-01-01T04:00:00Z');
    const T5 = d('2020-01-01T05:00:00Z');
    const T6 = d('2020-01-01T06:00:00Z');
    const T7 = d('2020-01-01T07:00:00Z');

    // Create config A with OTHER_USER as editor (so they can approve value/description changes)
    fixture.setNow(T1);
    const {configId: configAId} = await fixture.engine.useCases.createConfig(GLOBAL_CONTEXT, {
      name: 'config_a',
      value: {a: 1},
      schema: {type: 'object', properties: {a: {type: 'number'}}},
      description: 'A',
      currentUserEmail: CURRENT_USER_EMAIL,
      editorEmails: [CURRENT_USER_EMAIL, OTHER_USER_EMAIL],
      ownerEmails: [],
      projectId: fixture.projectId,
    });

    // Create first proposal for A (P1) at T1
    fixture.setNow(T1);
    const {configProposalId: P1} = await fixture.engine.useCases.createConfigProposal(
      GLOBAL_CONTEXT,
      {
        configId: configAId,
        proposedDescription: {newDescription: 'A1'},
        currentUserEmail: CURRENT_USER_EMAIL,
      },
    );

    // Create second proposal for A (P2) at T2
    fixture.setNow(T2);
    const {configProposalId: P2} = await fixture.engine.useCases.createConfigProposal(
      GLOBAL_CONTEXT,
      {
        configId: configAId,
        proposedValue: {newValue: {a: 2}},
        currentUserEmail: CURRENT_USER_EMAIL,
      },
    );

    // Create config B at T3 and its proposal (P3) at T4
    fixture.setNow(T3);
    const {configId: configBId} = await fixture.engine.useCases.createConfig(GLOBAL_CONTEXT, {
      name: 'config_b',
      value: {b: 1},
      schema: {type: 'object', properties: {b: {type: 'number'}}},
      description: 'B',
      currentUserEmail: CURRENT_USER_EMAIL,
      editorEmails: [CURRENT_USER_EMAIL, OTHER_USER_EMAIL],
      ownerEmails: [],
      projectId: fixture.projectId,
    });

    fixture.setNow(T4);
    const {configProposalId: P3} = await fixture.engine.useCases.createConfigProposal(
      GLOBAL_CONTEXT,
      {
        configId: configBId,
        proposedDescription: {newDescription: 'B1'},
        currentUserEmail: CURRENT_USER_EMAIL,
      },
    );

    // Approve P2 at T5 by OTHER_USER (editor)
    fixture.setNow(T5);
    await fixture.engine.useCases.approveConfigProposal(GLOBAL_CONTEXT, {
      proposalId: P2,
      currentUserEmail: OTHER_USER_EMAIL,
    });

    // Reject P3 at T6 by OTHER_USER
    fixture.setNow(T6);
    await fixture.engine.useCases.rejectConfigProposal(GLOBAL_CONTEXT, {
      proposalId: P3,
      currentUserEmail: OTHER_USER_EMAIL,
    });

    // 1) Filter by configIds (only A)
    {
      const {proposals} = await fixture.trpc.getConfigProposalList({
        projectId: fixture.projectId,
        configIds: [configAId],
      });
      // Order is desc by createdAt => P2 first, then P1
      expect(proposals.map(p => p.id)).toEqual([P2, P1]);
      expect(new Set(proposals.map(p => p.configId))).toEqual(new Set([configAId]));
      // check joined fields
      expect(proposals[0]?.configName).toBe('config_a');
      expect(proposals[0]?.proposerEmail).toBe(CURRENT_USER_EMAIL);
      // reviewer on approved P2
      const approved = proposals.find(p => p.id === P2);
      expect(approved?.reviewerEmail).toBe(OTHER_USER_EMAIL);
      expect(approved?.status).toBe('approved');
    }

    // 2) Filter by proposalIds (only P3)
    {
      const {proposals} = await fixture.trpc.getConfigProposalList({
        projectId: fixture.projectId,
        proposalIds: [P3],
      });
      expect(proposals.map(p => p.id)).toEqual([P3]);
      expect(proposals[0]?.status).toBe('rejected');
      expect(proposals[0]?.reviewerEmail).toBe(OTHER_USER_EMAIL);
      expect(proposals[0]?.configName).toBe('config_b');
    }

    // 3) Filter by statuses
    {
      const {proposals: pend} = await fixture.trpc.getConfigProposalList({
        projectId: fixture.projectId,
        statuses: ['pending'],
      });
      expect(pend.map(p => p.id)).toEqual([P1]);

      const {proposals: appr} = await fixture.trpc.getConfigProposalList({
        projectId: fixture.projectId,
        statuses: ['approved'],
      });
      expect(appr.map(p => p.id)).toEqual([P2]);

      const {proposals: rej} = await fixture.trpc.getConfigProposalList({
        projectId: fixture.projectId,
        statuses: ['rejected'],
      });
      expect(rej.map(p => p.id)).toEqual([P3]);

      const {proposals: mix} = await fixture.trpc.getConfigProposalList({
        projectId: fixture.projectId,
        statuses: ['pending', 'approved'],
      });
      expect(mix.map(p => p.id)).toEqual([P2, P1]);
    }

    // 4) Filter by createdAt range (>= T2 and < T4) => only P2
    {
      const {proposals} = await fixture.trpc.getConfigProposalList({
        projectId: fixture.projectId,
        createdAtGte: T2,
        createdAtLt: T4,
      });
      expect(proposals.map(p => p.id)).toEqual([P2]);
    }

    // 5) Filter by approvedAt range (>= T5 and < T6) => P2
    {
      const {proposals} = await fixture.trpc.getConfigProposalList({
        projectId: fixture.projectId,
        approvedAtGte: T5,
        approvedAtLt: T6,
      });
      expect(proposals.map(p => p.id)).toEqual([P2]);
    }

    // 6) Filter by rejectedAt range (>= T6 and < T7) => P3
    {
      const {proposals} = await fixture.trpc.getConfigProposalList({
        projectId: fixture.projectId,
        rejectedAtGte: T6,
        rejectedAtLt: T7,
      });
      expect(proposals.map(p => p.id)).toEqual([P3]);
    }
  });
});
