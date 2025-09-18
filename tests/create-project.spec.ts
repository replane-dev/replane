import {GLOBAL_CONTEXT} from '@/engine/core/context';
import {BadRequestError} from '@/engine/core/errors';
import {normalizeEmail} from '@/engine/core/utils';
import {describe, expect, it} from 'vitest';
import {useAppFixture} from './fixtures/trpc-fixture';

const CURRENT_USER_EMAIL = normalizeEmail('test@example.com');

// createProject logic is executed inside fixture.init() for default project; these tests create extra projects
// We assert audit messages, uniqueness constraints, and membership

describe('createProject', () => {
  const fixture = useAppFixture({authEmail: CURRENT_USER_EMAIL});

  it('creates a project with current user as owner and emits audit message', async () => {
    const {projectId} = await fixture.engine.useCases.createProject(GLOBAL_CONTEXT, {
      currentUserEmail: CURRENT_USER_EMAIL,
      name: 'Another Project',
      description: 'Second project',
    });

    // list projects through store (indirect via engine)
    const projects = await fixture.engine.testing.pool.query(
      `SELECT * FROM projects WHERE id = $1`,
      [projectId],
    );
    expect(projects.rows.length).toBe(1);
    expect(projects.rows[0].name).toBe('Another Project');

    // membership
    const members = await fixture.engine.testing.pool.query(
      `SELECT * FROM project_users WHERE project_id = $1`,
      [projectId],
    );
    expect(members.rows.map((r: any) => r.user_email_normalized)).toContain(CURRENT_USER_EMAIL);
    expect(members.rows[0].role).toBe('owner');

    // audit messages: project_created for default + project_created for this one => at least 2 messages overall, we filter by projectId
    const messages = await fixture.engine.testing.auditMessages.list({
      lte: new Date('2100-01-01T00:00:00Z'),
      limit: 20,
      orderBy: 'created_at desc, id desc',
      projectId,
    });
    const types = messages.map(m => m.payload.type);
    expect(types).toContain('project_created');
    const payload: any = messages.find(m => m.payload.type === 'project_created')?.payload;
    expect(payload.project.name).toBe('Another Project');
    expect(payload.project.description).toBe('Second project');
  });

  it('fails with duplicate name', async () => {
    await fixture.engine.useCases.createProject(GLOBAL_CONTEXT, {
      currentUserEmail: CURRENT_USER_EMAIL,
      name: 'DupProject',
      description: 'First',
    });

    await expect(
      fixture.engine.useCases.createProject(GLOBAL_CONTEXT, {
        currentUserEmail: CURRENT_USER_EMAIL,
        name: 'DupProject',
        description: 'Second',
      }),
    ).rejects.toBeInstanceOf(BadRequestError);
  });
});
