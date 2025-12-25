import {GLOBAL_CONTEXT} from '@/engine/core/context';
import {describe, expect, it} from 'vitest';
import {useAppFixture} from '../fixtures/app-fixture';

const CURRENT_USER_EMAIL = 'test@example.com';
const OTHER_USER_EMAIL = 'other@example.com';

describe('Admin API - List Project Members', () => {
  const fixture = useAppFixture({authEmail: CURRENT_USER_EMAIL});

  it('should list project members with member:read scope', async () => {
    const {token} = await fixture.createAdminApiKey({
      scopes: ['member:read'],
    });

    const response = await fixture.adminApiRequest(
      'GET',
      `/projects/${fixture.projectId}/members`,
      token,
    );

    expect(response.status).toBe(200);
    const data = await response.json();
    expect(data.members).toHaveLength(1);
    expect(data.members[0].email).toBe(CURRENT_USER_EMAIL);
    expect(data.members[0].role).toBeDefined();
  });

  it('should return 403 without member:read scope', async () => {
    const {token} = await fixture.createAdminApiKey({
      scopes: ['project:read'],
    });

    const response = await fixture.adminApiRequest(
      'GET',
      `/projects/${fixture.projectId}/members`,
      token,
    );

    expect(response.status).toBe(403);
  });

  it('should return 403 when API key does not have project access', async () => {
    // Create a second project that the API key will have access to
    const {projectId: otherProjectId} = await fixture.engine.useCases.createProject(
      GLOBAL_CONTEXT,
      {
        identity: fixture.identity,
        workspaceId: fixture.workspaceId,
        name: 'Other Project',
        description: 'Other project',
      },
    );

    // Create API key with access only to the other project
    const {token} = await fixture.createAdminApiKey({
      scopes: ['member:read'],
      projectIds: [otherProjectId],
    });

    // Try to access the first project's members
    const response = await fixture.adminApiRequest(
      'GET',
      `/projects/${fixture.projectId}/members`,
      token,
    );

    expect(response.status).toBe(403);
  });

  it('should list multiple project members', async () => {
    // Create another user
    const connection = await fixture.engine.testing.pool.connect();
    try {
      await connection.query(
        `INSERT INTO users(id, name, email, "emailVerified") VALUES ($1, 'Other User', $2, NOW())`,
        [2, OTHER_USER_EMAIL],
      );
    } finally {
      connection.release();
    }

    // Add the other user to the workspace first
    await fixture.engine.useCases.addWorkspaceMember(GLOBAL_CONTEXT, {
      identity: fixture.identity,
      workspaceId: fixture.workspaceId,
      memberEmail: OTHER_USER_EMAIL,
      role: 'member',
    });

    // Update project users to include both the current user and the other user
    await fixture.engine.useCases.updateProjectUsers(GLOBAL_CONTEXT, {
      identity: fixture.identity,
      projectId: fixture.projectId,
      users: [
        {email: CURRENT_USER_EMAIL, role: 'admin'},
        {email: OTHER_USER_EMAIL, role: 'maintainer'},
      ],
    });

    const {token} = await fixture.createAdminApiKey({
      scopes: ['member:read'],
    });

    const response = await fixture.adminApiRequest(
      'GET',
      `/projects/${fixture.projectId}/members`,
      token,
    );

    expect(response.status).toBe(200);
    const data = await response.json();
    expect(data.members).toHaveLength(2);

    const emails = data.members.map((m: {email: string}) => m.email);
    expect(emails).toContain(CURRENT_USER_EMAIL);
    expect(emails).toContain(OTHER_USER_EMAIL);
  });

  it('should return member with correct properties', async () => {
    const {token} = await fixture.createAdminApiKey({
      scopes: ['member:read'],
    });

    const response = await fixture.adminApiRequest(
      'GET',
      `/projects/${fixture.projectId}/members`,
      token,
    );

    expect(response.status).toBe(200);
    const data = await response.json();
    const member = data.members[0];

    expect(member.email).toBe(CURRENT_USER_EMAIL);
    expect(member.role).toBeDefined();
  });

  it('should work with project-scoped API key', async () => {
    const {token} = await fixture.createAdminApiKey({
      scopes: ['member:read'],
      projectIds: [fixture.projectId],
    });

    const response = await fixture.adminApiRequest(
      'GET',
      `/projects/${fixture.projectId}/members`,
      token,
    );

    expect(response.status).toBe(200);
    const data = await response.json();
    expect(data.members.length).toBeGreaterThan(0);
  });
});

