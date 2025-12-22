import {createAuditLogId} from '@/engine/core/stores/audit-log-store';
import {normalizeEmail} from '@/engine/core/utils';
import {describe, expect, it} from 'vitest';
import {emailToIdentity, useAppFixture} from './fixtures/trpc-fixture';

const TEST_USER_EMAIL = normalizeEmail('auditor@example.com');

// Helper to advance mock time
function advance(fixture: ReturnType<typeof useAppFixture>, ms: number) {
  fixture.setNow(new Date(fixture.now.getTime() + ms));
}

describe('getAuditLog', () => {
  const fixture = useAppFixture({authEmail: TEST_USER_EMAIL});

  it('returns result with initial messages', async () => {
    const {messages, nextCursor} = await fixture.trpc.getAuditLog({
      projectId: fixture.projectId,
    });
    // project_created = 1 message (environments are created without audit logs)
    expect(messages.length).toEqual(1);
    expect(nextCursor).toBeNull();
  });

  it('lists messages with pagination & cursor', async () => {
    // Initial state: 1 message (project_created)
    // create two configs (each generates an audit entry)
    await fixture.createConfig({
      overrides: [],
      name: 'cfg_a',
      value: 1,
      description: 'A',
      schema: {type: 'number'},
      identity: emailToIdentity(TEST_USER_EMAIL),
      editorEmails: [],
      maintainerEmails: [],
      projectId: fixture.projectId,
    });
    advance(fixture, 10);
    await fixture.createConfig({
      overrides: [],
      name: 'cfg_b',
      value: 2,
      description: 'B',
      schema: {type: 'number'},
      identity: emailToIdentity(TEST_USER_EMAIL),
      editorEmails: [],
      maintainerEmails: [],
      projectId: fixture.projectId,
    });
    // Now we have 3 messages: project_created + 2 config_created

    // Test pagination - get all messages 2 at a time
    const page1 = await fixture.trpc.getAuditLog({limit: 2, projectId: fixture.projectId});
    expect(page1.messages).toHaveLength(2);
    expect(page1.nextCursor).not.toBeNull();

    const page2 = await fixture.trpc.getAuditLog({
      limit: 2,
      cursor: page1.nextCursor!,
      projectId: fixture.projectId,
    });
    expect(page2.messages).toHaveLength(1);
    expect(page2.nextCursor).toBeNull();

    const allIds = [...page1.messages, ...page2.messages].map(m => m.id);
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

    // create audit log manually for other user (sdk key creation pattern)
    const now = new Date(fixture.now);
    await fixture.engine.testing.auditLogs.create({
      id: createAuditLogId(),
      createdAt: now,
      userId: 2,
      configId: null,
      payload: {
        type: 'sdk_key_created',
        sdkKey: {id: 'x', name: 'k', description: '', createdAt: now},
      },
      projectId: fixture.projectId,
    });

    await fixture.createConfig({
      overrides: [],
      name: 'cfg_c',
      value: 3,
      description: 'C',
      schema: {type: 'number'},
      identity: emailToIdentity(TEST_USER_EMAIL),
      editorEmails: [],
      maintainerEmails: [],
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
    await fixture.createConfig({
      overrides: [],
      name: 'cfg_filter_me',
      value: 3,
      description: 'C',
      schema: {type: 'number'},
      identity: emailToIdentity(TEST_USER_EMAIL),
      editorEmails: [],
      maintainerEmails: [],
      projectId: fixture.projectId,
    });
    await fixture.createConfig({
      overrides: [],
      name: 'cfg_dont_filter_me',
      value: 4,
      description: 'D',
      schema: {type: 'number'},
      identity: emailToIdentity(TEST_USER_EMAIL),
      editorEmails: [],
      maintainerEmails: [],
      projectId: fixture.projectId,
    });

    const {messages} = await fixture.trpc.getAuditLog({
      configNames: ['cfg_filter_me'],
      projectId: fixture.projectId,
    });
    expect(messages.find(m => m.configName === 'cfg_filter_me')).toBeTruthy();
  });

  it('returns empty when filters resolve to no user/config', async () => {
    await fixture.createConfig({
      overrides: [],
      name: 'cfg_exists',
      value: 5,
      description: 'E',
      schema: {type: 'number'},
      identity: emailToIdentity(TEST_USER_EMAIL),
      editorEmails: [],
      maintainerEmails: [],
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
