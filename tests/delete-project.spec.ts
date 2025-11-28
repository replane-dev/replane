import {GLOBAL_CONTEXT} from '@/engine/core/context';
import {BadRequestError, ForbiddenError} from '@/engine/core/errors';
import {normalizeEmail} from '@/engine/core/utils';
import {describe, expect, it} from 'vitest';
import {useAppFixture} from './fixtures/trpc-fixture';

const CURRENT_USER_EMAIL = normalizeEmail('test@example.com');
const OTHER_OWNER_EMAIL = normalizeEmail('other-owner@example.com');

describe('deleteProject', () => {
  const fixture = useAppFixture({authEmail: CURRENT_USER_EMAIL});

  it('deletes a project (not the last one) and emits audit message', async () => {
    // Create an extra project so default project is not last one when deleting
    const {projectId} = await fixture.engine.useCases.createProject(GLOBAL_CONTEXT, {
      currentUserEmail: CURRENT_USER_EMAIL,
      name: 'ToDelete',
      description: 'temp',
    });

    // Need at least two total projects; default + this one -> OK
    await fixture.engine.useCases.deleteProject(GLOBAL_CONTEXT, {
      id: projectId,
      confirmName: 'ToDelete',
      currentUserEmail: CURRENT_USER_EMAIL,
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
      currentUserEmail: CURRENT_USER_EMAIL,
      name: 'WrongConfirm',
      description: 'x',
    });

    await expect(
      fixture.engine.useCases.deleteProject(GLOBAL_CONTEXT, {
        id: projectId,
        confirmName: 'Mismatch',
        currentUserEmail: CURRENT_USER_EMAIL,
      }),
    ).rejects.toBeInstanceOf(BadRequestError);
  });

  it('prevents deleting the last remaining project', async () => {
    const allProjects = await fixture.engine.testing.projects.getAll({
      currentUserEmail: CURRENT_USER_EMAIL,
    });
    for (const project of allProjects.filter(x => x.id !== fixture.projectId)) {
      await fixture.engine.testing.projects.deleteById(project.id);
    }

    await expect(
      fixture.engine.useCases.deleteProject(GLOBAL_CONTEXT, {
        id: fixture.projectId,
        confirmName: 'Test Project',
        currentUserEmail: CURRENT_USER_EMAIL,
      }),
    ).rejects.toBeInstanceOf(BadRequestError);
  });

  it('forbids deletion by non-owner', async () => {
    // Create project with two owners then remove current user to drop ownership
    const {projectId} = await fixture.engine.useCases.createProject(GLOBAL_CONTEXT, {
      currentUserEmail: CURRENT_USER_EMAIL,
      name: 'ForbiddenDelete',
      description: 'x',
    });

    await fixture.engine.useCases.patchProject(GLOBAL_CONTEXT, {
      id: projectId,
      currentUserEmail: CURRENT_USER_EMAIL,
      members: {
        users: [
          {email: CURRENT_USER_EMAIL, role: 'admin'},
          {email: OTHER_OWNER_EMAIL, role: 'admin'},
        ],
      },
    });

    await fixture.engine.useCases.patchProject(GLOBAL_CONTEXT, {
      id: projectId,
      currentUserEmail: CURRENT_USER_EMAIL,
      members: {users: [{email: OTHER_OWNER_EMAIL, role: 'admin'}]},
    });

    await expect(
      fixture.engine.useCases.deleteProject(GLOBAL_CONTEXT, {
        id: projectId,
        confirmName: 'ForbiddenDelete',
        currentUserEmail: CURRENT_USER_EMAIL,
      }),
    ).rejects.toBeInstanceOf(ForbiddenError);
  });
});

describe('deleteProject with proposals required', () => {
  const fixture = useAppFixture({authEmail: CURRENT_USER_EMAIL, requireProposals: true});

  it('forbids direct deletion when proposals are required', async () => {
    // Create an extra project so we are not attempting to delete the last one
    const {projectId} = await fixture.engine.useCases.createProject(GLOBAL_CONTEXT, {
      currentUserEmail: CURRENT_USER_EMAIL,
      name: 'ToDeleteWithProposals',
      description: 'temp',
    });

    await expect(
      fixture.engine.useCases.deleteProject(GLOBAL_CONTEXT, {
        id: projectId,
        confirmName: 'ToDeleteWithProposals',
        currentUserEmail: CURRENT_USER_EMAIL,
      }),
    ).rejects.toBeInstanceOf(ForbiddenError);
  });
});
