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
    });

    await fixture.engine.useCases.deleteApiKey(GLOBAL_CONTEXT, {
      id: created.apiKey.id,
      currentUserEmail: CURRENT_USER_EMAIL,
    });

    const list = await fixture.engine.useCases.getApiKeyList(GLOBAL_CONTEXT, {
      currentUserEmail: CURRENT_USER_EMAIL,
    });
    expect(list.apiKeys).toHaveLength(0);
  });

  it('idempotent: deleting again is a no-op', async () => {
    const created = await fixture.engine.useCases.createApiKey(GLOBAL_CONTEXT, {
      currentUserEmail: CURRENT_USER_EMAIL,
      name: 'Idempotent',
      description: '',
    });
    await fixture.engine.useCases.deleteApiKey(GLOBAL_CONTEXT, {
      id: created.apiKey.id,
      currentUserEmail: CURRENT_USER_EMAIL,
    });
    // second delete should not throw
    await fixture.engine.useCases.deleteApiKey(GLOBAL_CONTEXT, {
      id: created.apiKey.id,
      currentUserEmail: CURRENT_USER_EMAIL,
    });
    const list = await fixture.engine.useCases.getApiKeyList(GLOBAL_CONTEXT, {
      currentUserEmail: CURRENT_USER_EMAIL,
    });
    expect(list.apiKeys.some(k => k.id === created.apiKey.id)).toBe(false);
  });

  it('non-creator cannot delete key', async () => {
    const created = await fixture.engine.useCases.createApiKey(GLOBAL_CONTEXT, {
      currentUserEmail: CURRENT_USER_EMAIL,
      name: 'ProtectMe',
      description: '',
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
      }),
    ).rejects.toBeInstanceOf(Error);
  });

  it('creates audit messages (api_key_created & api_key_deleted)', async () => {
    const created = await fixture.engine.useCases.createApiKey(GLOBAL_CONTEXT, {
      currentUserEmail: CURRENT_USER_EMAIL,
      name: 'ToDeleteAudit',
      description: '',
    });
    await fixture.engine.useCases.deleteApiKey(GLOBAL_CONTEXT, {
      id: created.apiKey.id,
      currentUserEmail: CURRENT_USER_EMAIL,
    });

    const messages = await fixture.engine.testing.auditMessages.list({
      lte: new Date('2100-01-01T00:00:00Z'),
      limit: 10,
      orderBy: 'created_at desc, id desc',
    });
    const types = messages.map(m => (m as any).payload.type).sort();
    expect(types).toEqual(['api_key_created', 'api_key_deleted']);
    const byType: Record<string, any> = Object.fromEntries(
      messages.map(m => [(m as any).payload.type, (m as any).payload]),
    );
    expect(byType.api_key_created.apiKey.id).toBe(created.apiKey.id);
    expect(byType.api_key_deleted.apiKey.id).toBe(created.apiKey.id);
    expect(byType.api_key_deleted.apiKey.name).toBe('ToDeleteAudit');
    // deletion payload should not contain token
    expect(byType.api_key_deleted.apiKey.token).toBeUndefined();
  });
});
