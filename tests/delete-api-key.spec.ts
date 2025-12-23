import {GLOBAL_CONTEXT} from '@/engine/core/context';
import {normalizeEmail} from '@/engine/core/utils';
import {describe, expect, it} from 'vitest';
import {emailToIdentity, TEST_USER_ID, useAppFixture} from './fixtures/app-fixture';

const CURRENT_USER_EMAIL = normalizeEmail('keydel@example.com');

describe('deleteSdkKey', () => {
  const fixture = useAppFixture({authEmail: CURRENT_USER_EMAIL});

  it('creator can delete their key', async () => {
    const created = await fixture.engine.useCases.createSdkKey(GLOBAL_CONTEXT, {
      identity: emailToIdentity(CURRENT_USER_EMAIL),
      name: 'DeleteMe',
      description: '',
      projectId: fixture.projectId,
      environmentId: fixture.productionEnvironmentId,
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
      name: 'ProtectMe',
      description: '',
      projectId: fixture.projectId,
      environmentId: fixture.productionEnvironmentId,
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
      fixture.engine.useCases.deleteSdkKey(GLOBAL_CONTEXT, {
        id: created.sdkKey.id,
        identity: emailToIdentity(otherEmail),
        projectId: fixture.projectId,
      }),
    ).rejects.toBeInstanceOf(Error);
  });

  it('creates audit messages (sdk_key_created & sdk_key_deleted)', async () => {
    const created = await fixture.engine.useCases.createSdkKey(GLOBAL_CONTEXT, {
      identity: emailToIdentity(CURRENT_USER_EMAIL),
      name: 'ToDeleteAudit',
      description: '',
      projectId: fixture.projectId,
      environmentId: fixture.productionEnvironmentId,
    });
    await fixture.engine.useCases.deleteSdkKey(GLOBAL_CONTEXT, {
      id: created.sdkKey.id,
      identity: emailToIdentity(CURRENT_USER_EMAIL),
      projectId: fixture.projectId,
    });

    const messages = await fixture.engine.testing.auditLogs.list({
      lte: new Date('2100-01-01T00:00:00Z'),
      limit: 20,
      orderBy: 'created_at desc, id desc',
      projectId: fixture.projectId,
    });
    const types = messages.map(m => m.payload.type).sort();
    expect(types).toContain('sdk_key_created');
    expect(types).toContain('sdk_key_deleted');
    expect(types).toContain('project_created');

    const byType: Record<string, any> = Object.fromEntries(
      messages.map(m => [m.payload.type, m.payload]),
    );
    expect(byType.sdk_key_created.sdkKey.id).toBe(created.sdkKey.id);
    expect(byType.sdk_key_deleted.sdkKey.id).toBe(created.sdkKey.id);
    expect(byType.sdk_key_deleted.sdkKey.name).toBe('ToDeleteAudit');
    // deletion payload should not contain token
    expect(byType.sdk_key_deleted.sdkKey.token).toBeUndefined();
  });
});
