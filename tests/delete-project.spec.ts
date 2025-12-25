import {GLOBAL_CONTEXT} from '@/engine/core/context';
import {BadRequestError, ForbiddenError} from '@/engine/core/errors';
import {normalizeEmail} from '@/engine/core/utils';
import {describe, expect, it} from 'vitest';
import {useAppFixture} from './fixtures/app-fixture';

const ADMIN_USER_EMAIL = normalizeEmail('admin@example.com');
const TEST_USER_EMAIL = normalizeEmail('test@example.com');
const OTHER_OWNER_EMAIL = normalizeEmail('other-owner@example.com');

describe('deleteProject', () => {
  const fixture = useAppFixture({authEmail: ADMIN_USER_EMAIL});

  it('deletes a project (not the last one) and emits audit message', async () => {
    // Create an extra project so default project is not last one when deleting
    const {projectId} = await fixture.engine.useCases.createProject(GLOBAL_CONTEXT, {
      identity: fixture.identity,
      workspaceId: fixture.workspaceId,
      name: 'ToDelete',
      description: 'temp',
    });

    // Need at least two total projects; default + this one -> OK
    await fixture.engine.useCases.deleteProject(GLOBAL_CONTEXT, {
      id: projectId,
      confirmName: 'ToDelete',
      identity: fixture.identity,
    });

    const res = await fixture.engine.testing.pool.query(`SELECT * FROM projects WHERE id = $1`, [
      projectId,
    ]);
    expect(res.rows.length).toBe(0);

    // project_deleted message stores projectId null, so we cannot filter by projectId. Fetch a broader set.
    const messages = await fixture.engine.testing.auditLogs.list({
      lte: new Date('2100-01-01T00:00:00Z'),
      limit: 50,
      orderBy: 'created_at desc, id desc',
    });
    // Filter for project_deleted entries containing our name
    const deleted = messages.find(
      m => m.payload.type === 'project_deleted' && (m.payload as any).project.name === 'ToDelete',
    );
    expect(deleted).toBeTruthy();
  });

  it('fails when confirmation name does not match', async () => {
    const {projectId} = await fixture.engine.useCases.createProject(GLOBAL_CONTEXT, {
      identity: fixture.identity,
      workspaceId: fixture.workspaceId,
      name: 'WrongConfirm',
      description: 'x',
    });

    await expect(
      fixture.engine.useCases.deleteProject(GLOBAL_CONTEXT, {
        id: projectId,
        confirmName: 'Mismatch',
        identity: fixture.identity,
      }),
    ).rejects.toBeInstanceOf(BadRequestError);
  });

  it('prevents deleting the last remaining project', async () => {
    const allProjects = await fixture.engine.testing.projects.getUserProjects({
      currentUserEmail: ADMIN_USER_EMAIL,
    });
    for (const project of allProjects.filter(x => x.id !== fixture.projectId)) {
      await fixture.engine.testing.projects.deleteById(project.id);
    }

    await expect(
      fixture.engine.useCases.deleteProject(GLOBAL_CONTEXT, {
        id: fixture.projectId,
        confirmName: 'Test Project',
        identity: fixture.identity,
      }),
    ).rejects.toBeInstanceOf(BadRequestError);
  });

  it('forbids deletion by non-owner', async () => {
    // Register a non-admin user who will have no project permissions
    const testUserIdentity = await fixture.registerNonAdminWorkspaceMember(TEST_USER_EMAIL);

    // Create project with only OTHER_OWNER as owner (not TEST_USER)
    const {projectId} = await fixture.engine.useCases.createProject(GLOBAL_CONTEXT, {
      identity: fixture.identity,
      workspaceId: fixture.workspaceId,
      name: 'ForbiddenDelete',
      description: 'x',
    });

    await fixture.engine.useCases.patchProject(GLOBAL_CONTEXT, {
      id: projectId,
      identity: fixture.identity,
      members: {users: [{email: OTHER_OWNER_EMAIL, role: 'admin'}]},
    });

    // Try to delete as non-owner (should fail)
    await expect(
      fixture.engine.useCases.deleteProject(GLOBAL_CONTEXT, {
        id: projectId,
        confirmName: 'ForbiddenDelete',
        identity: testUserIdentity,
      }),
    ).rejects.toBeInstanceOf(ForbiddenError);
  });
});

describe('deleteProject with proposals required', () => {
  const fixture = useAppFixture({authEmail: ADMIN_USER_EMAIL});

  it('allows deletion even when proposals are required (if user has permissions)', async () => {
    // Update project to require proposals
    await fixture.engine.useCases.patchProject(GLOBAL_CONTEXT, {
      id: fixture.projectId,
      details: {
        name: 'Test Project',
        description: 'Default project for tests',
        requireProposals: true,
        allowSelfApprovals: false,
      },
      identity: fixture.identity,
    });

    // Create an extra project so we are not attempting to delete the last one
    const {projectId} = await fixture.engine.useCases.createProject(GLOBAL_CONTEXT, {
      identity: fixture.identity,
      workspaceId: fixture.workspaceId,
      name: 'ToDeleteWithProposals',
      description: 'temp',
      requireProposals: true,
      allowSelfApprovals: false,
    });

    // Should succeed - admins can delete projects even when requireProposals is true
    await fixture.engine.useCases.deleteProject(GLOBAL_CONTEXT, {
      id: projectId,
      confirmName: 'ToDeleteWithProposals',
      identity: fixture.identity,
    });

    // Verify project is deleted
    const deletedProject = await fixture.engine.testing.projects.getById({
      id: projectId,
      currentUserEmail: ADMIN_USER_EMAIL,
    });
    expect(deletedProject).toBeUndefined();
  });
});
