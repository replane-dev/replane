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
    const {messages, nextCursor} = await fixture.trpc.getAuditLog({
      projectId: fixture.projectId,
    });
    expect(messages.length).toEqual(1); // project creation message
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
      projectId: fixture.projectId,
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
      projectId: fixture.projectId,
    });

    const page1 = await fixture.trpc.getAuditLog({limit: 1, projectId: fixture.projectId});
    expect(page1.messages).toHaveLength(1);
    expect(page1.nextCursor).not.toBeNull();
    expect(page1.messages[0].payload.type).toBe('project_created');

    const page2 = await fixture.trpc.getAuditLog({
      limit: 1,
      cursor: page1.nextCursor!,
      projectId: fixture.projectId,
    });
    expect(page2.messages).toHaveLength(1);
    // second page should have no further cursor
    expect(page2.nextCursor).not.toBeNull();
    expect(page2.messages[0].configName).toBe('cfg_b');

    const page3 = await fixture.trpc.getAuditLog({
      limit: 1,
      cursor: page2.nextCursor!,
      projectId: fixture.projectId,
    });
    expect(page3.messages).toHaveLength(1);
    // third page should have no further cursor
    expect(page3.nextCursor).toBeNull();
    expect(page3.messages[0].configName).toBe('cfg_a');

    const allIds = [...page1.messages, ...page2.messages, ...page3.messages].map(m => m.id);
    expect(new Set(allIds).size).toBe(3);
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
      projectId: fixture.projectId,
    });

    await fixture.engine.useCases.createConfig(GLOBAL_CONTEXT, {
      name: 'cfg_c',
      value: 3,
      description: 'C',
      schema: {type: 'number'},
      currentUserEmail: TEST_USER_EMAIL,
      editorEmails: [],
      ownerEmails: [],
      projectId: fixture.projectId,
    });

    const {messages} = await fixture.trpc.getAuditLog({
      authorEmails: [otherEmail],
      projectId: fixture.projectId,
    });
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
      projectId: fixture.projectId,
    });
    await fixture.engine.useCases.createConfig(GLOBAL_CONTEXT, {
      name: 'cfg_dont_filter_me',
      value: 4,
      description: 'D',
      schema: {type: 'number'},
      currentUserEmail: TEST_USER_EMAIL,
      editorEmails: [],
      ownerEmails: [],
      projectId: fixture.projectId,
    });

    const {messages} = await fixture.trpc.getAuditLog({
      configNames: ['cfg_filter_me'],
      projectId: fixture.projectId,
    });
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
      projectId: fixture.projectId,
    });

    const res1 = await fixture.trpc.getAuditLog({
      authorEmails: ['missing@example.com'],
      projectId: fixture.projectId,
    });
    expect(res1.messages).toHaveLength(0);
    const res2 = await fixture.trpc.getAuditLog({
      configNames: ['no-such-config'],
      projectId: fixture.projectId,
    });
    expect(res2.messages).toHaveLength(0);
  });
});
