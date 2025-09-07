import {createAuditMessageId} from '@/engine/core/audit-message-store';
import {GLOBAL_CONTEXT} from '@/engine/core/context';
import {normalizeEmail} from '@/engine/core/utils';
import {describe, expect, it} from 'vitest';
import {useAppFixture} from './fixtures/trpc-fixture';

const TEST_USER_EMAIL = normalizeEmail('auditor@example.com');

// Helper to advance mock time
function advance(fixture: ReturnType<typeof useAppFixture>, ms: number) {
  fixture.setNow(new Date(fixture.now.getTime() + ms));
}

describe('getAuditLog', () => {
  const fixture = useAppFixture({authEmail: TEST_USER_EMAIL});

  it('returns empty result when no messages', async () => {
    const {messages, nextCursor} = await fixture.trpc.getAuditLog({});
    expect(messages).toEqual([]);
    expect(nextCursor).toBeNull();
  });

  it('lists messages with pagination & cursor', async () => {
    // create two configs (each generates an audit entry)
    await fixture.engine.useCases.createConfig(GLOBAL_CONTEXT, {
      name: 'cfg_a',
      value: 1,
      description: 'A',
      schema: {type: 'number'},
      currentUserEmail: TEST_USER_EMAIL,
      editorEmails: [],
      ownerEmails: [],
    });
    advance(fixture, 10);
    await fixture.engine.useCases.createConfig(GLOBAL_CONTEXT, {
      name: 'cfg_b',
      value: 2,
      description: 'B',
      schema: {type: 'number'},
      currentUserEmail: TEST_USER_EMAIL,
      editorEmails: [],
      ownerEmails: [],
    });

    const page1 = await fixture.trpc.getAuditLog({limit: 1});
    expect(page1.messages).toHaveLength(1);
    expect(page1.nextCursor).not.toBeNull();
    expect(page1.messages[0].configName).toBe('cfg_b');

    const page2 = await fixture.trpc.getAuditLog({limit: 1, cursor: page1.nextCursor!});
    expect(page2.messages).toHaveLength(1);
    // second page should have no further cursor
    expect(page2.nextCursor).toBeNull();
    expect(page2.messages[0].configName).toBe('cfg_a');

    const allIds = [...page1.messages, ...page2.messages].map(m => m.id);
    expect(new Set(allIds).size).toBe(2);
  });

  it('filters by author email', async () => {
    // second user
    const otherEmail = normalizeEmail('other@example.com');
    const connection = await fixture.engine.testing.pool.connect();
    try {
      await connection.query(
        `INSERT INTO users(id, name, email, "emailVerified") VALUES (2, 'Other', $1, NOW())`,
        [otherEmail],
      );
    } finally {
      connection.release();
    }

    // create audit message manually for other user (api key creation pattern)
    const now = new Date(fixture.now);
    await fixture.engine.testing.auditMessages.create({
      id: createAuditMessageId(),
      createdAt: now,
      userId: 2,
      configId: null,
      payload: {
        type: 'api_key_created',
        apiKey: {id: 'x', name: 'k', description: '', createdAt: now},
      },
    });

    await fixture.engine.useCases.createConfig(GLOBAL_CONTEXT, {
      name: 'cfg_c',
      value: 3,
      description: 'C',
      schema: {type: 'number'},
      currentUserEmail: TEST_USER_EMAIL,
      editorEmails: [],
      ownerEmails: [],
    });

    const {messages} = await fixture.trpc.getAuditLog({authorEmails: [otherEmail]});
    expect(messages).toHaveLength(1);
    expect(messages[0].userEmail).toBe(otherEmail);
  });

  it('filters by config names', async () => {
    await fixture.engine.useCases.createConfig(GLOBAL_CONTEXT, {
      name: 'cfg_filter_me',
      value: 3,
      description: 'C',
      schema: {type: 'number'},
      currentUserEmail: TEST_USER_EMAIL,
      editorEmails: [],
      ownerEmails: [],
    });
    await fixture.engine.useCases.createConfig(GLOBAL_CONTEXT, {
      name: 'cfg_dont_filter_me',
      value: 4,
      description: 'D',
      schema: {type: 'number'},
      currentUserEmail: TEST_USER_EMAIL,
      editorEmails: [],
      ownerEmails: [],
    });

    const {messages} = await fixture.trpc.getAuditLog({configNames: ['cfg_filter_me']});
    expect(messages.find(m => m.configName === 'cfg_filter_me')).toBeTruthy();
  });

  it('returns empty when filters resolve to no user/config', async () => {
    await fixture.engine.useCases.createConfig(GLOBAL_CONTEXT, {
      name: 'cfg_exists',
      value: 5,
      description: 'E',
      schema: {type: 'number'},
      currentUserEmail: TEST_USER_EMAIL,
      editorEmails: [],
      ownerEmails: [],
    });

    const res1 = await fixture.trpc.getAuditLog({authorEmails: ['missing@example.com']});
    expect(res1.messages).toHaveLength(0);
    const res2 = await fixture.trpc.getAuditLog({configNames: ['no-such-config']});
    expect(res2.messages).toHaveLength(0);
  });
});
