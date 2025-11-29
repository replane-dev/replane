import assert from 'assert';
import {createAuditLogId} from '../audit-log-store';
import {BadRequestError, ForbiddenError, NotFoundError} from '../errors';
import type {TransactionalUseCase} from '../use-case';
import type {NormalizedEmail} from '../zod';

export interface DeleteOrganizationRequest {
  organizationId: string;
  currentUserEmail: NormalizedEmail;
}

export interface DeleteOrganizationResponse {
  success: boolean;
}

export function createDeleteOrganizationUseCase(): TransactionalUseCase<
  DeleteOrganizationRequest,
  DeleteOrganizationResponse
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

    // Only admins can delete organizations
    if (organization.myRole !== 'admin') {
      throw new ForbiddenError('Only organization admins can delete the organization');
    }

    // Prevent deletion of personal organizations
    if (organization.personalOrgUserId) {
      throw new BadRequestError(
        'Cannot delete personal organization. Personal organizations are automatically created for each user.',
      );
    }

    const user = await tx.users.getByEmail(req.currentUserEmail);
    assert(user, 'Current user not found');

    await tx.auditLogs.create({
      id: createAuditLogId(),
      createdAt: now,
      projectId: null,
      userId: user.id,
      configId: null,
      payload: {
        type: 'organization_deleted',
        organization: {
          id: req.organizationId,
          name: organization.name,
        },
      },
    });

    await tx.organizations.deleteById(req.organizationId);

    return {success: true};
  };
}
