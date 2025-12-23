import {GLOBAL_CONTEXT} from '@/engine/core/context';
import {normalizeEmail} from '@/engine/core/utils';
import {describe, expect, it} from 'vitest';
import {emailToIdentity, TEST_USER_ID, useAppFixture} from './fixtures/app-fixture';

const CURRENT_USER_EMAIL = normalizeEmail('keyuser@example.com');

describe('sdk keys', () => {
  const fixture = useAppFixture({authEmail: CURRENT_USER_EMAIL});

  it('creates an sdk key and returns one-time token', async () => {
    const result = await fixture.engine.useCases.createSdkKey(GLOBAL_CONTEXT, {
      identity: emailToIdentity(CURRENT_USER_EMAIL),
      name: 'Primary Key',
      description: 'Main key',
      projectId: fixture.projectId,
      environmentId: fixture.productionEnvironmentId,
    });

    // Expect format: rp_<80 hex chars> (24 random bytes + 16 uuid bytes)
    expect(result.sdkKey.token).toMatch(/^rp_[a-f0-9]{80}$/i);
    expect(result.sdkKey.name).toBe('Primary Key');
    expect(result.sdkKey.description).toBe('Main key');

    const list = await fixture.engine.useCases.getSdkKeyList(GLOBAL_CONTEXT, {
      identity: emailToIdentity(CURRENT_USER_EMAIL),
      projectId: fixture.projectId,
    });

    expect(list.sdkKeys).toHaveLength(1);
    expect(list.sdkKeys[0]).toMatchObject({
      name: 'Primary Key',
      description: 'Main key',
    });
  });

  it('lists multiple keys ordered by createdAt desc', async () => {
    await fixture.engine.useCases.createSdkKey(GLOBAL_CONTEXT, {
      identity: emailToIdentity(CURRENT_USER_EMAIL),
      name: 'First',
      description: '',
      projectId: fixture.projectId,
      environmentId: fixture.productionEnvironmentId,
    });
    // Advance time a bit for ordering
    fixture.setNow(new Date('2020-01-01T00:01:00Z'));
    await fixture.engine.useCases.createSdkKey(GLOBAL_CONTEXT, {
      identity: emailToIdentity(CURRENT_USER_EMAIL),
      name: 'Second',
      description: 'second desc',
      projectId: fixture.projectId,
      environmentId: fixture.productionEnvironmentId,
    });

    const list = await fixture.engine.useCases.getSdkKeyList(GLOBAL_CONTEXT, {
      identity: emailToIdentity(CURRENT_USER_EMAIL),
      projectId: fixture.projectId,
    });

    expect(list.sdkKeys.map(k => k.name)).toEqual(['Second', 'First']);
  });

  it('can fetch a single key by id', async () => {
    const created = await fixture.engine.useCases.createSdkKey(GLOBAL_CONTEXT, {
      identity: emailToIdentity(CURRENT_USER_EMAIL),
      projectId: fixture.projectId,
      environmentId: fixture.productionEnvironmentId,
      name: 'FetchMe',
      description: 'desc',
    });

    const single = await fixture.engine.useCases.getSdkKey(GLOBAL_CONTEXT, {
      id: created.sdkKey.id,
      identity: emailToIdentity(CURRENT_USER_EMAIL),
      projectId: fixture.projectId,
    });

    expect(single.sdkKey).toBeTruthy();
    expect(single.sdkKey).toMatchObject({
      id: created.sdkKey.id,
      name: 'FetchMe',
      description: 'desc',
    });
  });

  it('returns null when fetching non-existing key', async () => {
    const single = await fixture.engine.useCases.getSdkKey(GLOBAL_CONTEXT, {
      id: '00000000-0000-0000-0000-000000000000',
      identity: emailToIdentity(CURRENT_USER_EMAIL),
      projectId: fixture.projectId,
    });
    expect(single.sdkKey).toBeNull();
  });

  it('creator can delete their key', async () => {
    const created = await fixture.engine.useCases.createSdkKey(GLOBAL_CONTEXT, {
      identity: emailToIdentity(CURRENT_USER_EMAIL),
      projectId: fixture.projectId,
      environmentId: fixture.productionEnvironmentId,
      name: 'DeleteMe',
      description: '',
    });

    await fixture.engine.useCases.deleteSdkKey(GLOBAL_CONTEXT, {
      id: created.sdkKey.id,
      identity: emailToIdentity(CURRENT_USER_EMAIL),
      projectId: fixture.projectId,
    });

    const list = await fixture.engine.useCases.getSdkKeyList(GLOBAL_CONTEXT, {
      identity: emailToIdentity(CURRENT_USER_EMAIL),
      projectId: fixture.projectId,
    });
    expect(list.sdkKeys).toHaveLength(0);
  });

  it('non-creator cannot delete key', async () => {
    const created = await fixture.engine.useCases.createSdkKey(GLOBAL_CONTEXT, {
      identity: emailToIdentity(CURRENT_USER_EMAIL),
      projectId: fixture.projectId,
      environmentId: fixture.productionEnvironmentId,
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
      fixture.engine.useCases.deleteSdkKey(GLOBAL_CONTEXT, {
        id: created.sdkKey.id,
        identity: emailToIdentity(otherEmail),
        projectId: fixture.projectId,
      }),
    ).rejects.toBeInstanceOf(Error);
  });
});
