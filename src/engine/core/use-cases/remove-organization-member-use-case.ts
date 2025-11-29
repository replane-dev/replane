import assert from 'assert';
import {createAuditLogId} from '../audit-log-store';
import {BadRequestError, ForbiddenError, NotFoundError} from '../errors';
import type {TransactionalUseCase} from '../use-case';
import type {NormalizedEmail} from '../zod';

export interface RemoveOrganizationMemberRequest {
  organizationId: string;
  currentUserEmail: NormalizedEmail;
  memberEmail: string;
}

export interface RemoveOrganizationMemberResponse {
  success: boolean;
}

export function createRemoveOrganizationMemberUseCase(): TransactionalUseCase<
  RemoveOrganizationMemberRequest,
  RemoveOrganizationMemberResponse
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

    // Only admins can remove members
    if (organization.myRole !== 'admin') {
      throw new ForbiddenError('Only organization admins can remove members');
    }

    // Prevent removing members from personal organizations
    if (organization.personalOrgUserId) {
      throw new BadRequestError(
        'Cannot remove members from personal organization. Personal organizations can only have one member.',
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

    // Prevent removing the last admin
    const members = await tx.organizationMembers.getByOrganizationId(req.organizationId);
    const adminCount = members.filter(m => m.role === 'admin').length;

    if (existingMember.role === 'admin' && adminCount <= 1) {
      throw new BadRequestError('Cannot remove the last admin from the organization');
    }

    const user = await tx.users.getByEmail(req.currentUserEmail);
    assert(user, 'Current user not found');

    await tx.organizationMembers.delete(req.organizationId, req.memberEmail);

    await tx.auditLogs.create({
      id: createAuditLogId(),
      createdAt: now,
      projectId: null,
      userId: user.id,
      configId: null,
      payload: {
        type: 'organization_member_removed',
        organization: {
          id: req.organizationId,
          name: organization.name,
        },
        member: {
          email: req.memberEmail,
          role: existingMember.role,
        },
      },
    });

    return {success: true};
  };
}
