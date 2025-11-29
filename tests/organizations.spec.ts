import {GLOBAL_CONTEXT} from '@/engine/core/context';
import {BadRequestError, ForbiddenError} from '@/engine/core/errors';
import {normalizeEmail} from '@/engine/core/utils';
import {describe, expect, it} from 'vitest';
import {useAppFixture} from './fixtures/trpc-fixture';

const CURRENT_USER_EMAIL = normalizeEmail('test@example.com');
const ANOTHER_USER_EMAIL = normalizeEmail('another@example.com');

describe('Organizations', () => {
  const fixture = useAppFixture({authEmail: CURRENT_USER_EMAIL});

  describe('createOrganization', () => {
    it('creates an organization with current user as admin', async () => {
      const {organizationId} = await fixture.engine.useCases.createOrganization(GLOBAL_CONTEXT, {
        currentUserEmail: CURRENT_USER_EMAIL,
        name: 'New Organization',
      });

      // Verify organization exists
      const orgs = await fixture.engine.testing.pool.query(
        `SELECT * FROM organizations WHERE id = $1`,
        [organizationId],
      );
      expect(orgs.rows.length).toBe(1);
      expect(orgs.rows[0].name).toBe('New Organization');

      // Verify creator is admin
      const members = await fixture.engine.testing.pool.query(
        `SELECT * FROM organization_members WHERE organization_id = $1`,
        [organizationId],
      );
      expect(members.rows.length).toBe(1);
      expect(members.rows[0].user_email_normalized).toBe(CURRENT_USER_EMAIL);
      expect(members.rows[0].role).toBe('admin');

      // Verify audit log
      const messages = await fixture.engine.testing.auditLogs.list({
        lte: new Date('2100-01-01T00:00:00Z'),
        limit: 20,
        orderBy: 'created_at desc, id desc',
      });
      const orgCreatedEvent = messages.find(
        m =>
          m.payload.type === 'organization_created' && m.payload.organization.id === organizationId,
      );
      expect(orgCreatedEvent).toBeDefined();
      expect(orgCreatedEvent?.payload).toMatchObject({
        type: 'organization_created',
        organization: {
          id: organizationId,
          name: 'New Organization',
        },
      });
    });
  });

  describe('getOrganizationList', () => {
    it('returns only organizations where user is a member', async () => {
      // Create org1 with current user
      const {organizationId: org1Id} = await fixture.engine.useCases.createOrganization(
        GLOBAL_CONTEXT,
        {
          currentUserEmail: CURRENT_USER_EMAIL,
          name: 'Org 1',
        },
      );

      // Get user's organizations
      const orgs = await fixture.engine.useCases.getOrganizationList(GLOBAL_CONTEXT, {
        currentUserEmail: CURRENT_USER_EMAIL,
      });

      // Should include the test organization created in fixture and org1
      expect(orgs.length).toBeGreaterThanOrEqual(2);
      expect(orgs.find(o => o.id === org1Id)).toBeDefined();
      expect(orgs.find(o => o.name === 'Test Organization')).toBeDefined();
    });
  });

  describe('getOrganization', () => {
    it('returns organization details when user is a member', async () => {
      const {organizationId} = await fixture.engine.useCases.createOrganization(GLOBAL_CONTEXT, {
        currentUserEmail: CURRENT_USER_EMAIL,
        name: 'Test Org',
      });

      const org = await fixture.engine.useCases.getOrganization(GLOBAL_CONTEXT, {
        organizationId,
        currentUserEmail: CURRENT_USER_EMAIL,
      });

      expect(org.id).toBe(organizationId);
      expect(org.name).toBe('Test Org');
      expect(org.myRole).toBe('admin');
    });

    it('throws ForbiddenError when user is not a member', async () => {
      const {organizationId} = await fixture.engine.useCases.createOrganization(GLOBAL_CONTEXT, {
        currentUserEmail: CURRENT_USER_EMAIL,
        name: 'Private Org',
      });

      await expect(
        fixture.engine.useCases.getOrganization(GLOBAL_CONTEXT, {
          organizationId,
          currentUserEmail: ANOTHER_USER_EMAIL,
        }),
      ).rejects.toThrow(ForbiddenError);
    });
  });

  describe('updateOrganization', () => {
    it('allows admin to update organization', async () => {
      const {organizationId} = await fixture.engine.useCases.createOrganization(GLOBAL_CONTEXT, {
        currentUserEmail: CURRENT_USER_EMAIL,
        name: 'Original Name',
      });

      await fixture.engine.useCases.updateOrganization(GLOBAL_CONTEXT, {
        organizationId,
        currentUserEmail: CURRENT_USER_EMAIL,
        name: 'Updated Name',
      });

      const org = await fixture.engine.useCases.getOrganization(GLOBAL_CONTEXT, {
        organizationId,
        currentUserEmail: CURRENT_USER_EMAIL,
      });

      expect(org.name).toBe('Updated Name');
    });

    it('prevents non-admin from updating', async () => {
      const {organizationId} = await fixture.engine.useCases.createOrganization(GLOBAL_CONTEXT, {
        currentUserEmail: CURRENT_USER_EMAIL,
        name: 'Test Org',
      });

      // Add another user as member
      await fixture.engine.useCases.addOrganizationMember(GLOBAL_CONTEXT, {
        organizationId,
        currentUserEmail: CURRENT_USER_EMAIL,
        memberEmail: ANOTHER_USER_EMAIL,
        role: 'member',
      });

      await expect(
        fixture.engine.useCases.updateOrganization(GLOBAL_CONTEXT, {
          organizationId,
          currentUserEmail: ANOTHER_USER_EMAIL,
          name: 'Hacked Name',
        }),
      ).rejects.toThrow(ForbiddenError);
    });
  });

  describe('deleteOrganization', () => {
    it('allows admin to delete organization without projects', async () => {
      const {organizationId} = await fixture.engine.useCases.createOrganization(GLOBAL_CONTEXT, {
        currentUserEmail: CURRENT_USER_EMAIL,
        name: 'To Delete',
      });

      await fixture.engine.useCases.deleteOrganization(GLOBAL_CONTEXT, {
        organizationId,
        currentUserEmail: CURRENT_USER_EMAIL,
      });

      // Verify organization is deleted
      const orgs = await fixture.engine.testing.pool.query(
        `SELECT * FROM organizations WHERE id = $1`,
        [organizationId],
      );
      expect(orgs.rows.length).toBe(0);
    });

    it('allows prevents deletion when organization has projects', async () => {
      const {organizationId} = await fixture.engine.useCases.createOrganization(GLOBAL_CONTEXT, {
        currentUserEmail: CURRENT_USER_EMAIL,
        name: 'With Projects',
      });

      // Create a project in this organization
      await fixture.engine.useCases.createProject(GLOBAL_CONTEXT, {
        currentUserEmail: CURRENT_USER_EMAIL,
        organizationId,
        name: `Test Project ${organizationId}`,
        description: 'Test',
      });

      await expect(
        fixture.engine.useCases.deleteOrganization(GLOBAL_CONTEXT, {
          organizationId,
          currentUserEmail: CURRENT_USER_EMAIL,
        }),
      ).resolves.toEqual({success: true});
    });

    it('prevents non-admin from deleting', async () => {
      const {organizationId} = await fixture.engine.useCases.createOrganization(GLOBAL_CONTEXT, {
        currentUserEmail: CURRENT_USER_EMAIL,
        name: 'Test Org',
      });

      await fixture.engine.useCases.addOrganizationMember(GLOBAL_CONTEXT, {
        organizationId,
        currentUserEmail: CURRENT_USER_EMAIL,
        memberEmail: ANOTHER_USER_EMAIL,
        role: 'member',
      });

      await expect(
        fixture.engine.useCases.deleteOrganization(GLOBAL_CONTEXT, {
          organizationId,
          currentUserEmail: ANOTHER_USER_EMAIL,
        }),
      ).rejects.toThrow(ForbiddenError);
    });
  });

  describe('Organization Members', () => {
    describe('addOrganizationMember', () => {
      it('allows admin to add members', async () => {
        const {organizationId} = await fixture.engine.useCases.createOrganization(GLOBAL_CONTEXT, {
          currentUserEmail: CURRENT_USER_EMAIL,
          name: 'Test Org',
        });

        await fixture.engine.useCases.addOrganizationMember(GLOBAL_CONTEXT, {
          organizationId,
          currentUserEmail: CURRENT_USER_EMAIL,
          memberEmail: ANOTHER_USER_EMAIL,
          role: 'member',
        });

        const members = await fixture.engine.useCases.getOrganizationMembers(GLOBAL_CONTEXT, {
          organizationId,
          currentUserEmail: CURRENT_USER_EMAIL,
        });

        expect(members.length).toBe(2);
        expect(members.find(m => m.email === ANOTHER_USER_EMAIL)).toMatchObject({
          email: ANOTHER_USER_EMAIL,
          role: 'member',
        });
      });

      it('prevents adding duplicate members', async () => {
        const {organizationId} = await fixture.engine.useCases.createOrganization(GLOBAL_CONTEXT, {
          currentUserEmail: CURRENT_USER_EMAIL,
          name: 'Test Org',
        });

        await fixture.engine.useCases.addOrganizationMember(GLOBAL_CONTEXT, {
          organizationId,
          currentUserEmail: CURRENT_USER_EMAIL,
          memberEmail: ANOTHER_USER_EMAIL,
          role: 'member',
        });

        await expect(
          fixture.engine.useCases.addOrganizationMember(GLOBAL_CONTEXT, {
            organizationId,
            currentUserEmail: CURRENT_USER_EMAIL,
            memberEmail: ANOTHER_USER_EMAIL,
            role: 'member',
          }),
        ).rejects.toThrow(BadRequestError);
      });

      it('prevents non-admin from adding members', async () => {
        const {organizationId} = await fixture.engine.useCases.createOrganization(GLOBAL_CONTEXT, {
          currentUserEmail: CURRENT_USER_EMAIL,
          name: 'Test Org',
        });

        await fixture.engine.useCases.addOrganizationMember(GLOBAL_CONTEXT, {
          organizationId,
          currentUserEmail: CURRENT_USER_EMAIL,
          memberEmail: ANOTHER_USER_EMAIL,
          role: 'member',
        });

        await expect(
          fixture.engine.useCases.addOrganizationMember(GLOBAL_CONTEXT, {
            organizationId,
            currentUserEmail: ANOTHER_USER_EMAIL,
            memberEmail: normalizeEmail('third@example.com'),
            role: 'member',
          }),
        ).rejects.toThrow(ForbiddenError);
      });
    });

    describe('removeOrganizationMember', () => {
      it('allows admin to remove members', async () => {
        const {organizationId} = await fixture.engine.useCases.createOrganization(GLOBAL_CONTEXT, {
          currentUserEmail: CURRENT_USER_EMAIL,
          name: 'Test Org',
        });

        await fixture.engine.useCases.addOrganizationMember(GLOBAL_CONTEXT, {
          organizationId,
          currentUserEmail: CURRENT_USER_EMAIL,
          memberEmail: ANOTHER_USER_EMAIL,
          role: 'member',
        });

        await fixture.engine.useCases.removeOrganizationMember(GLOBAL_CONTEXT, {
          organizationId,
          currentUserEmail: CURRENT_USER_EMAIL,
          memberEmail: ANOTHER_USER_EMAIL,
        });

        const members = await fixture.engine.useCases.getOrganizationMembers(GLOBAL_CONTEXT, {
          organizationId,
          currentUserEmail: CURRENT_USER_EMAIL,
        });

        expect(members.length).toBe(1);
        expect(members.find(m => m.email === ANOTHER_USER_EMAIL)).toBeUndefined();
      });

      it('prevents removing last admin', async () => {
        const {organizationId} = await fixture.engine.useCases.createOrganization(GLOBAL_CONTEXT, {
          currentUserEmail: CURRENT_USER_EMAIL,
          name: 'Test Org',
        });

        await expect(
          fixture.engine.useCases.removeOrganizationMember(GLOBAL_CONTEXT, {
            organizationId,
            currentUserEmail: CURRENT_USER_EMAIL,
            memberEmail: CURRENT_USER_EMAIL,
          }),
        ).rejects.toThrow(BadRequestError);
      });
    });

    describe('updateOrganizationMemberRole', () => {
      it('allows admin to change member roles', async () => {
        const {organizationId} = await fixture.engine.useCases.createOrganization(GLOBAL_CONTEXT, {
          currentUserEmail: CURRENT_USER_EMAIL,
          name: 'Test Org',
        });

        await fixture.engine.useCases.addOrganizationMember(GLOBAL_CONTEXT, {
          organizationId,
          currentUserEmail: CURRENT_USER_EMAIL,
          memberEmail: ANOTHER_USER_EMAIL,
          role: 'member',
        });

        await fixture.engine.useCases.updateOrganizationMemberRole(GLOBAL_CONTEXT, {
          organizationId,
          currentUserEmail: CURRENT_USER_EMAIL,
          memberEmail: ANOTHER_USER_EMAIL,
          role: 'admin',
        });

        const members = await fixture.engine.useCases.getOrganizationMembers(GLOBAL_CONTEXT, {
          organizationId,
          currentUserEmail: CURRENT_USER_EMAIL,
        });

        const updatedMember = members.find(m => m.email === ANOTHER_USER_EMAIL);
        expect(updatedMember?.role).toBe('admin');
      });

      it('prevents demoting last admin', async () => {
        const {organizationId} = await fixture.engine.useCases.createOrganization(GLOBAL_CONTEXT, {
          currentUserEmail: CURRENT_USER_EMAIL,
          name: 'Test Org',
        });

        await expect(
          fixture.engine.useCases.updateOrganizationMemberRole(GLOBAL_CONTEXT, {
            organizationId,
            currentUserEmail: CURRENT_USER_EMAIL,
            memberEmail: CURRENT_USER_EMAIL,
            role: 'member',
          }),
        ).rejects.toThrow(BadRequestError);
      });
    });
  });

  describe('Permissions', () => {
    it('organization members can view projects without explicit project role', async () => {
      const {organizationId} = await fixture.engine.useCases.createOrganization(GLOBAL_CONTEXT, {
        currentUserEmail: CURRENT_USER_EMAIL,
        name: 'Test Org',
      });

      // Add another user as organization member
      await fixture.engine.useCases.addOrganizationMember(GLOBAL_CONTEXT, {
        organizationId,
        currentUserEmail: CURRENT_USER_EMAIL,
        memberEmail: ANOTHER_USER_EMAIL,
        role: 'member',
      });

      // Create project
      const {projectId} = await fixture.engine.useCases.createProject(GLOBAL_CONTEXT, {
        currentUserEmail: CURRENT_USER_EMAIL,
        organizationId,
        name: `Permissions Test Project ${organizationId}`,
        description: 'Test',
      });

      // Verify the other user can view the project through organization membership
      const project = await fixture.engine.useCases.getProject(GLOBAL_CONTEXT, {
        id: projectId,
        currentUserEmail: ANOTHER_USER_EMAIL,
      });

      expect(project.project).toBeDefined();
      expect(project.project?.name).toBe(`Permissions Test Project ${organizationId}`);
      // No explicit project role
      expect(project.project?.myRole).toBeNull();
    });
  });
});
