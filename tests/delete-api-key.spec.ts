import {GLOBAL_CONTEXT} from '@/engine/core/context';
import {normalizeEmail} from '@/engine/core/utils';
import {describe, expect, it} from 'vitest';
import {TEST_USER_ID, useAppFixture} from './fixtures/trpc-fixture';

const CURRENT_USER_EMAIL = normalizeEmail('keydel@example.com');

describe('deleteApiKey', () => {
  const fixture = useAppFixture({authEmail: CURRENT_USER_EMAIL});

  it('creator can delete their key', async () => {
    const created = await fixture.engine.useCases.createApiKey(GLOBAL_CONTEXT, {
      currentUserEmail: CURRENT_USER_EMAIL,
      name: 'DeleteMe',
      description: '',
      projectId: fixture.projectId,
    });

    await fixture.engine.useCases.deleteApiKey(GLOBAL_CONTEXT, {
      id: created.apiKey.id,
      currentUserEmail: CURRENT_USER_EMAIL,
      projectId: fixture.projectId,
    });

    const list = await fixture.engine.useCases.getApiKeyList(GLOBAL_CONTEXT, {
      currentUserEmail: CURRENT_USER_EMAIL,
      projectId: fixture.projectId,
    });
    expect(list.apiKeys).toHaveLength(0);
  });

  it('non-creator cannot delete key', async () => {
    const created = await fixture.engine.useCases.createApiKey(GLOBAL_CONTEXT, {
      currentUserEmail: CURRENT_USER_EMAIL,
      name: 'ProtectMe',
      description: '',
      projectId: fixture.projectId,
    });

    // second user
    const otherEmail = normalizeEmail('other@example.com');
    const connection = await fixture.engine.testing.pool.connect();
    try {
      await connection.query(
        `INSERT INTO users(id, name, email, "emailVerified") VALUES ($1, 'Other User', $2, NOW())`,
        [TEST_USER_ID + 1, otherEmail],
      );
    } finally {
      connection.release();
    }

    await expect(
      fixture.engine.useCases.deleteApiKey(GLOBAL_CONTEXT, {
        id: created.apiKey.id,
        currentUserEmail: otherEmail,
        projectId: fixture.projectId,
      }),
    ).rejects.toBeInstanceOf(Error);
  });

  it('creates audit messages (api_key_created & api_key_deleted)', async () => {
    const created = await fixture.engine.useCases.createApiKey(GLOBAL_CONTEXT, {
      currentUserEmail: CURRENT_USER_EMAIL,
      name: 'ToDeleteAudit',
      description: '',
      projectId: fixture.projectId,
    });
    await fixture.engine.useCases.deleteApiKey(GLOBAL_CONTEXT, {
      id: created.apiKey.id,
      currentUserEmail: CURRENT_USER_EMAIL,
      projectId: fixture.projectId,
    });

    const messages = await fixture.engine.testing.auditMessages.list({
      lte: new Date('2100-01-01T00:00:00Z'),
      limit: 10,
      orderBy: 'created_at desc, id desc',
      projectId: fixture.projectId,
    });
    const types = messages.map(m => m.payload.type).sort();
    expect(types).toEqual(['api_key_created', 'api_key_deleted', 'project_created']);
    const byType: Record<string, any> = Object.fromEntries(
      messages.map(m => [m.payload.type, m.payload]),
    );
    expect(byType.api_key_created.apiKey.id).toBe(created.apiKey.id);
    expect(byType.api_key_deleted.apiKey.id).toBe(created.apiKey.id);
    expect(byType.api_key_deleted.apiKey.name).toBe('ToDeleteAudit');
    // deletion payload should not contain token
    expect(byType.api_key_deleted.apiKey.token).toBeUndefined();
  });
});
