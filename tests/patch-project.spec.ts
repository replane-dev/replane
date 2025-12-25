import {GLOBAL_CONTEXT} from '@/engine/core/context';
import {BadRequestError, ForbiddenError} from '@/engine/core/errors';
import {normalizeEmail} from '@/engine/core/utils';
import {describe, expect, it} from 'vitest';
import {useAppFixture} from './fixtures/app-fixture';

const ADMIN_USER_EMAIL = normalizeEmail('admin@example.com');
const TEST_USER_EMAIL = normalizeEmail('test@example.com');
const OTHER_OWNER_EMAIL = normalizeEmail('other-owner@example.com');

// We test patching details and members. For permission negative test we remove the only owner membership.

describe('patchProject', () => {
  const fixture = useAppFixture({authEmail: ADMIN_USER_EMAIL});

  async function getProject(projectId: string) {
    const res = await fixture.engine.testing.pool.query(`SELECT * FROM projects WHERE id = $1`, [
      projectId,
    ]);
    return res.rows[0];
  }

  async function getMembers(projectId: string) {
    const res = await fixture.engine.testing.pool.query(
      `SELECT user_email_normalized, role FROM project_users WHERE project_id = $1 ORDER BY user_email_normalized`,
      [projectId],
    );
    return res.rows;
  }

  it('updates name and description (owner/maintainer permission) and emits audit message', async () => {
    const projectId = fixture.projectId; // created in fixture

    await fixture.engine.useCases.patchProject(GLOBAL_CONTEXT, {
      id: projectId,
      identity: fixture.identity,
      details: {name: 'Renamed Project', description: 'Updated description'},
    });

    const project = await getProject(projectId);
    expect(project.name).toBe('Renamed Project');
    expect(project.description).toBe('Updated description');

    const messages = await fixture.engine.testing.auditLogs.list({
      lte: new Date('2100-01-01T00:00:00Z'),
      limit: 20,
      orderBy: 'created_at desc, id desc',
      projectId,
    });
    const updated = messages.find(m => m.payload.type === 'project_updated')?.payload as any;
    expect(updated?.after.name).toBe('Renamed Project');
  });

  it('fails on duplicate name', async () => {
    // create second project
    await fixture.engine.useCases.createProject(GLOBAL_CONTEXT, {
      workspaceId: fixture.workspaceId,
      identity: fixture.identity,
      name: 'SecondProj',
      description: 'desc',
    });

    await expect(
      fixture.engine.useCases.patchProject(GLOBAL_CONTEXT, {
        id: fixture.projectId,
        identity: fixture.identity,
        details: {name: 'SecondProj', description: 'x'}, // already existing name from previous test
      }),
    ).rejects.toBeInstanceOf(BadRequestError);
  });

  it('updates members (add/remove) and emits audit message', async () => {
    const {projectId} = await fixture.engine.useCases.createProject(GLOBAL_CONTEXT, {
      workspaceId: fixture.workspaceId,
      identity: fixture.identity,
      name: 'MembersProj',
      description: 'members',
    });

    // add another owner
    await fixture.engine.useCases.patchProject(GLOBAL_CONTEXT, {
      id: projectId,
      identity: fixture.identity,
      members: {
        users: [
          {email: ADMIN_USER_EMAIL, role: 'admin'},
          {email: OTHER_OWNER_EMAIL, role: 'admin'},
        ],
      },
    });

    let members = await getMembers(projectId);
    expect(members.map((m: any) => m.user_email_normalized).sort()).toEqual(
      [ADMIN_USER_EMAIL, OTHER_OWNER_EMAIL].sort(),
    );

    // now remove current user (leave OTHER_OWNER_EMAIL only) -> should succeed since at least one owner remains
    await fixture.engine.useCases.patchProject(GLOBAL_CONTEXT, {
      id: projectId,
      identity: fixture.identity,
      members: {users: [{email: OTHER_OWNER_EMAIL, role: 'admin'}]},
    });

    members = await getMembers(projectId);
    expect(members.map((m: any) => m.user_email_normalized)).toEqual([OTHER_OWNER_EMAIL]);

    const messages = await fixture.engine.testing.auditLogs.list({
      lte: new Date('2100-01-01T00:00:00Z'),
      limit: 50,
      orderBy: 'created_at desc, id desc',
      projectId,
    });
    const types = messages.map(m => m.payload.type);
    expect(types).toContain('project_members_changed');
  });

  it('fails when removing all owners', async () => {
    const {projectId} = await fixture.engine.useCases.createProject(GLOBAL_CONTEXT, {
      workspaceId: fixture.workspaceId,
      identity: fixture.identity,
      name: 'NoOwnerRemoval',
      description: 'members',
    });

    await expect(
      fixture.engine.useCases.patchProject(GLOBAL_CONTEXT, {
        id: projectId,
        identity: fixture.identity,
        members: {users: []},
      }),
    ).rejects.toBeInstanceOf(BadRequestError);
  });

  it('forbids member edit by non-owner', async () => {
    // Register a non-admin user who will have no project permissions
    const testUserIdentity = await fixture.registerNonAdminWorkspaceMember(TEST_USER_EMAIL);

    // Create project with only OTHER_OWNER as owner
    const {projectId} = await fixture.engine.useCases.createProject(GLOBAL_CONTEXT, {
      workspaceId: fixture.workspaceId,
      identity: fixture.identity,
      name: 'ForbiddenMembersEdit',
      description: 'x',
    });

    await fixture.engine.useCases.patchProject(GLOBAL_CONTEXT, {
      id: projectId,
      identity: fixture.identity,
      members: {users: [{email: OTHER_OWNER_EMAIL, role: 'admin'}]},
    });

    // Attempt member change as non-owner -> should be forbidden
    await expect(
      fixture.engine.useCases.patchProject(GLOBAL_CONTEXT, {
        id: projectId,
        identity: testUserIdentity,
        members: {
          users: [
            {email: OTHER_OWNER_EMAIL, role: 'admin'},
            {email: 'third@example.com', role: 'admin'},
          ],
        },
      }),
    ).rejects.toBeInstanceOf(ForbiddenError);
  });
});
