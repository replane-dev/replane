import type {ConfigVersionRestoredAuditMessagePayload} from '@/engine/core/audit-message-store';
import {GLOBAL_CONTEXT} from '@/engine/core/context';
import {normalizeEmail} from '@/engine/core/utils';
import {describe, expect, it} from 'vitest';
import {useAppFixture} from './fixtures/trpc-fixture';

const TEST_USER_EMAIL = normalizeEmail('user@example.com');

describe('restore-config-version', () => {
  const fx = useAppFixture({authEmail: TEST_USER_EMAIL});

  it('restores an old version creating a new version with same contents', async () => {
    await fx.engine.useCases.createConfig(GLOBAL_CONTEXT, {
      overrides: [],
      name: 'restore-demo',
      description: 'initial',
      value: {a: 1},
      schema: null,
      maintainerEmails: [TEST_USER_EMAIL],
      editorEmails: [],
      currentUserEmail: TEST_USER_EMAIL,
      projectId: fx.projectId,
    });

    const configV1 = await fx.trpc.getConfig({name: 'restore-demo', projectId: fx.projectId});
    const prevVersion = configV1.config!.config.version as number;

    await fx.engine.useCases.patchConfig(GLOBAL_CONTEXT, {
      configId: configV1.config!.config.id,
      prevVersion,
      value: {newValue: {a: 2}},
      currentUserEmail: TEST_USER_EMAIL,
    });

    const configV2 = await fx.trpc.getConfig({name: 'restore-demo', projectId: fx.projectId});
    expect(configV2.config!.config.version).toBe(prevVersion + 1);
    expect(configV2.config!.config.value).toEqual({a: 2});

    await fx.trpc.restoreConfigVersion({
      name: 'restore-demo',
      versionToRestore: 1,
      expectedCurrentVersion: configV2.config!.config.version,
      projectId: fx.projectId,
    });

    const configV3 = await fx.trpc.getConfig({name: 'restore-demo', projectId: fx.projectId});
    expect(configV3.config!.config.version).toBe(configV2.config!.config.version + 1);
    expect(configV3.config!.config.value).toEqual({a: 1});

    const version3 = await fx.trpc.getConfigVersion({
      name: 'restore-demo',
      version: configV3.config!.config.version,
      projectId: fx.projectId,
    });
    expect(version3.version?.value).toEqual({a: 1});
  });

  it('creates audit message (config_version_restored)', async () => {
    await fx.engine.useCases.createConfig(GLOBAL_CONTEXT, {
      overrides: [],
      name: 'restore-audit',
      description: 'initial',
      value: {a: 1},
      schema: null,
      maintainerEmails: [TEST_USER_EMAIL],
      editorEmails: [],
      currentUserEmail: TEST_USER_EMAIL,
      projectId: fx.projectId,
    });
    const v1 = await fx.trpc.getConfig({name: 'restore-audit', projectId: fx.projectId});
    await fx.engine.useCases.patchConfig(GLOBAL_CONTEXT, {
      configId: v1.config!.config.id,
      prevVersion: v1.config!.config.version,
      value: {newValue: {a: 2}},
      currentUserEmail: TEST_USER_EMAIL,
    });
    const v2 = await fx.trpc.getConfig({name: 'restore-audit', projectId: fx.projectId});
    await fx.trpc.restoreConfigVersion({
      name: 'restore-audit',
      versionToRestore: 1,
      expectedCurrentVersion: v2.config!.config.version,
      projectId: fx.projectId,
    });
    const messages = await fx.engine.testing.auditMessages.list({
      lte: new Date('2100-01-01T00:00:00Z'),
      limit: 20,
      orderBy: 'created_at desc, id desc',
      projectId: fx.projectId,
    });
    const types = messages.map(m => m.payload.type).sort();
    expect(types).toEqual([
      'config_created',
      'config_updated',
      'config_version_restored',
      'project_created',
    ]);
    const restored = messages.find(m => m.payload.type === 'config_version_restored')
      ?.payload as ConfigVersionRestoredAuditMessagePayload;
    expect(restored.restoredFromVersion).toBe(1);
    // before was version 2 with value {a:2}, after is version 3 with value {a:1}
    expect(restored.before.value).toEqual({a: 2});
    expect(restored.after.value).toEqual({a: 1});
    expect(restored.after.version).toBe(restored.before.version + 1);
  });

  it('should restore members from version snapshot', async () => {
    const otherUser = normalizeEmail('other@example.com');
    const thirdUser = normalizeEmail('third@example.com');

    // Create config with initial members
    await fx.engine.useCases.createConfig(GLOBAL_CONTEXT, {
      overrides: [],
      name: 'restore-members',
      description: 'initial',
      value: {x: 1},
      schema: null,
      maintainerEmails: [TEST_USER_EMAIL],
      editorEmails: [otherUser],
      currentUserEmail: TEST_USER_EMAIL,
      projectId: fx.projectId,
    });

    const v1 = await fx.trpc.getConfig({name: 'restore-members', projectId: fx.projectId});

    // Update to version 2 with different members
    await fx.engine.useCases.patchConfig(GLOBAL_CONTEXT, {
      configId: v1.config!.config.id,
      prevVersion: v1.config!.config.version,
      members: {
        newMembers: [
          {email: TEST_USER_EMAIL, role: 'maintainer'},
          {email: thirdUser, role: 'editor'}, // Changed from otherUser to thirdUser
        ],
      },
      currentUserEmail: TEST_USER_EMAIL,
    });

    const v2 = await fx.trpc.getConfig({name: 'restore-members', projectId: fx.projectId});
    expect(v2.config!.editorEmails).toEqual([thirdUser]);

    // Restore to version 1
    await fx.trpc.restoreConfigVersion({
      name: 'restore-members',
      versionToRestore: 1,
      expectedCurrentVersion: v2.config!.config.version,
      projectId: fx.projectId,
    });

    const v3 = await fx.trpc.getConfig({name: 'restore-members', projectId: fx.projectId});

    // Restore doesn't change members, only value/schema/description
    expect(v3.config!.config.version).toBe(3);
    expect(v3.config!.editorEmails).toEqual([thirdUser]); // Members not restored

    // Verify the version snapshot has CURRENT members (thirdUser), not v1 members (otherUser)
    const version3Id = await fx.engine.testing.pool.query(
      `SELECT id FROM config_versions WHERE config_id = $1 AND version = 3`,
      [v1.config!.config.id],
    );
    const v3Id = version3Id.rows[0].id;

    const v3Members = await fx.engine.testing.pool.query(
      `SELECT user_email_normalized, role FROM config_version_members WHERE config_version_id = $1`,
      [v3Id],
    );
    const v3Owners = v3Members.rows
      .filter(m => m.role === 'maintainer')
      .map(m => m.user_email_normalized);
    const v3Editors = v3Members.rows
      .filter(m => m.role === 'editor')
      .map(m => m.user_email_normalized);

    expect(v3Owners).toEqual([TEST_USER_EMAIL]);
    expect(v3Editors).toEqual([thirdUser]); // Current members, not restored from v1
  });

  it('should version members correctly when patching', async () => {
    const editor1 = normalizeEmail('editor1@example.com');
    const editor2 = normalizeEmail('editor2@example.com');

    await fx.engine.useCases.createConfig(GLOBAL_CONTEXT, {
      overrides: [],
      name: 'version-members-test',
      description: 'test',
      value: {x: 1},
      schema: null,
      maintainerEmails: [TEST_USER_EMAIL],
      editorEmails: [editor1],
      currentUserEmail: TEST_USER_EMAIL,
      projectId: fx.projectId,
    });

    const v1 = await fx.trpc.getConfig({name: 'version-members-test', projectId: fx.projectId});

    // Patch to change members
    await fx.engine.useCases.patchConfig(GLOBAL_CONTEXT, {
      configId: v1.config!.config.id,
      prevVersion: v1.config!.config.version,
      members: {
        newMembers: [
          {email: TEST_USER_EMAIL, role: 'maintainer'},
          {email: editor2, role: 'editor'},
        ],
      },
      currentUserEmail: TEST_USER_EMAIL,
    });

    // Verify the version was created with correct members
    const version2Id = await fx.engine.testing.pool.query(
      `SELECT id FROM config_versions WHERE config_id = $1 AND version = 2`,
      [v1.config!.config.id],
    );
    const v2Id = version2Id.rows[0].id;

    const v2Members = await fx.engine.testing.pool.query(
      `SELECT user_email_normalized, role FROM config_version_members WHERE config_version_id = $1`,
      [v2Id],
    );

    expect(v2Members.rows.length).toBeGreaterThan(0);
    const v2Owners = v2Members.rows
      .filter(m => m.role === 'maintainer')
      .map(m => m.user_email_normalized);
    const v2Editors = v2Members.rows
      .filter(m => m.role === 'editor')
      .map(m => m.user_email_normalized);

    expect(v2Owners).toEqual([TEST_USER_EMAIL]);
    expect(v2Editors).toEqual([editor2]);
  });
});
