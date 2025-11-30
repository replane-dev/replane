import assert from 'assert';
import {BadRequestError, ForbiddenError, NotFoundError} from '../errors';
import {createAuditLogId} from '../stores/audit-log-store';
import type {OrganizationMemberRole} from '../stores/organization-member-store';
import type {TransactionalUseCase} from '../use-case';
import type {NormalizedEmail} from '../zod';

export interface UpdateOrganizationMemberRoleRequest {
  organizationId: string;
  currentUserEmail: NormalizedEmail;
  memberEmail: string;
  role: OrganizationMemberRole;
}

export interface UpdateOrganizationMemberRoleResponse {
  success: boolean;
}

export function createUpdateOrganizationMemberRoleUseCase(): TransactionalUseCase<
  UpdateOrganizationMemberRoleRequest,
  UpdateOrganizationMemberRoleResponse
> {
  return async (ctx, tx, req) => {
    await tx.permissionService.ensureIsOrganizationAdmin(ctx, {
      organizationId: req.organizationId,
      currentUserEmail: req.currentUserEmail,
    });

    const now = new Date();

    const organization = await tx.organizations.getById({
      id: req.organizationId,
      currentUserEmail: req.currentUserEmail,
    });

    if (!organization) {
      throw new NotFoundError('Organization not found');
    }

    // Only admins can update member roles
    if (organization.myRole !== 'admin') {
      throw new ForbiddenError('Only organization admins can update member roles');
    }

    // Prevent updating roles in personal organizations
    if (organization.personalOrgUserId) {
      throw new BadRequestError(
        'Cannot update member roles in personal organization. Personal organizations can only have one member.',
      );
    }

    // Check if member exists
    const existingMember = await tx.organizationMembers.getByOrganizationIdAndEmail({
      organizationId: req.organizationId,
      userEmail: req.memberEmail as NormalizedEmail,
    });

    if (!existingMember) {
      throw new NotFoundError('User is not a member of this organization');
    }

    // Prevent demoting the last admin
    if (existingMember.role === 'admin' && req.role !== 'admin') {
      const members = await tx.organizationMembers.getByOrganizationId(req.organizationId);
      const adminCount = members.filter(m => m.role === 'admin').length;

      if (adminCount <= 1) {
        throw new BadRequestError('Cannot demote the last admin of the organization');
      }
    }

    const user = await tx.users.getByEmail(req.currentUserEmail);
    assert(user, 'Current user not found');

    await tx.organizationMembers.updateRole({
      organizationId: req.organizationId,
      userEmail: req.memberEmail,
      role: req.role,
      updatedAt: now,
    });

    await tx.auditLogs.create({
      id: createAuditLogId(),
      createdAt: now,
      projectId: null,
      userId: user.id,
      configId: null,
      payload: {
        type: 'organization_member_role_changed',
        organization: {
          id: req.organizationId,
          name: organization.name,
        },
        member: {
          email: req.memberEmail,
        },
        before: {
          role: existingMember.role,
        },
        after: {
          role: req.role,
        },
      },
    });

    return {success: true};
  };
}
