import assert from 'assert';
import {createAuditLogId} from '../audit-log-store';
import {BadRequestError, ForbiddenError, NotFoundError} from '../errors';
import type {OrganizationMemberRole} from '../organization-member-store';
import type {TransactionalUseCase} from '../use-case';
import type {NormalizedEmail} from '../zod';

export interface AddOrganizationMemberRequest {
  organizationId: string;
  currentUserEmail: NormalizedEmail;
  memberEmail: string;
  role: OrganizationMemberRole;
}

export interface AddOrganizationMemberResponse {
  success: boolean;
}

export function createAddOrganizationMemberUseCase(): TransactionalUseCase<
  AddOrganizationMemberRequest,
  AddOrganizationMemberResponse
> {
  return async (ctx, tx, req) => {
    const now = new Date();

    const organization = await tx.organizations.getById({
      id: req.organizationId,
      currentUserEmail: req.currentUserEmail,
    });

    if (!organization) {
      throw new NotFoundError('Organization not found');
    }

    // Only admins can add members
    if (organization.myRole !== 'admin') {
      throw new ForbiddenError('Only organization admins can add members');
    }

    // Prevent adding members to personal organizations
    if (organization.personalOrgUserId) {
      throw new BadRequestError(
        'Cannot add members to personal organization. Personal organizations can only have one member.',
      );
    }

    // Check if member already exists
    const existingMember = await tx.organizationMembers.getByOrganizationIdAndEmail({
      organizationId: req.organizationId,
      userEmail: req.memberEmail as NormalizedEmail,
    });

    if (existingMember) {
      throw new BadRequestError('User is already a member of this organization');
    }

    const user = await tx.users.getByEmail(req.currentUserEmail);
    assert(user, 'Current user not found');

    await tx.organizationMembers.create([
      {
        organizationId: req.organizationId,
        email: req.memberEmail,
        role: req.role,
        createdAt: now,
        updatedAt: now,
      },
    ]);

    await tx.auditLogs.create({
      id: createAuditLogId(),
      createdAt: now,
      projectId: null,
      userId: user.id,
      configId: null,
      payload: {
        type: 'organization_member_added',
        organization: {
          id: req.organizationId,
          name: organization.name,
        },
        member: {
          email: req.memberEmail,
          role: req.role,
        },
      },
    });

    return {success: true};
  };
}
