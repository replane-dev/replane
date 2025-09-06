import {GLOBAL_CONTEXT} from '@/engine/core/context';
import {normalizeEmail} from '@/engine/core/utils';
import {describe, expect, it} from 'vitest';
import {TEST_USER_ID, useAppFixture} from './fixtures/trpc-fixture';

const CURRENT_USER_EMAIL = normalizeEmail('keyuser@example.com');

describe('api keys', () => {
  const fixture = useAppFixture({authEmail: CURRENT_USER_EMAIL});

  it('creates an api key and returns one-time token', async () => {
    const result = await fixture.engine.useCases.createApiKey(GLOBAL_CONTEXT, {
      currentUserEmail: CURRENT_USER_EMAIL,
      name: 'Primary Key',
      description: 'Main key',
    });

    expect(result.apiKey.token).toMatch(/^cm_[a-f0-9]{48}$/);
    expect(result.apiKey.name).toBe('Primary Key');
    expect(result.apiKey.description).toBe('Main key');

    const list = await fixture.engine.useCases.getApiKeyList(GLOBAL_CONTEXT, {
      currentUserEmail: CURRENT_USER_EMAIL,
    });

    expect(list.apiKeys).toHaveLength(1);
    expect(list.apiKeys[0]).toMatchObject({
      name: 'Primary Key',
      description: 'Main key',
    });
  });

  it('lists multiple keys ordered by createdAt desc', async () => {
    await fixture.engine.useCases.createApiKey(GLOBAL_CONTEXT, {
      currentUserEmail: CURRENT_USER_EMAIL,
      name: 'First',
      description: '',
    });
    // Advance time a bit for ordering
    fixture.setNow(new Date('2020-01-01T00:01:00Z'));
    await fixture.engine.useCases.createApiKey(GLOBAL_CONTEXT, {
      currentUserEmail: CURRENT_USER_EMAIL,
      name: 'Second',
      description: 'second desc',
    });

    const list = await fixture.engine.useCases.getApiKeyList(GLOBAL_CONTEXT, {
      currentUserEmail: CURRENT_USER_EMAIL,
    });

    expect(list.apiKeys.map(k => k.name)).toEqual(['Second', 'First']);
  });

  it('can fetch a single key by id', async () => {
    const created = await fixture.engine.useCases.createApiKey(GLOBAL_CONTEXT, {
      currentUserEmail: CURRENT_USER_EMAIL,
      name: 'FetchMe',
      description: 'desc',
    });

    const single = await fixture.engine.useCases.getApiKey(GLOBAL_CONTEXT, {
      id: created.apiKey.id,
      currentUserEmail: CURRENT_USER_EMAIL,
    });

    expect(single.apiKey).toBeTruthy();
    expect(single.apiKey).toMatchObject({
      id: created.apiKey.id,
      name: 'FetchMe',
      description: 'desc',
    });
  });

  it('returns null when fetching non-existing key', async () => {
    const single = await fixture.engine.useCases.getApiKey(GLOBAL_CONTEXT, {
      id: '00000000-0000-0000-0000-000000000000',
      currentUserEmail: CURRENT_USER_EMAIL,
    });
    expect(single.apiKey).toBeNull();
  });

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

  it('non-creator cannot delete key', async () => {
    const created = await fixture.engine.useCases.createApiKey(GLOBAL_CONTEXT, {
      currentUserEmail: CURRENT_USER_EMAIL,
      name: 'ProtectMe',
      description: '',
    });

    // Create second user
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
});
