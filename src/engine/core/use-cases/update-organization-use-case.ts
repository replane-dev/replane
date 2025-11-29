import assert from 'assert';
import {createAuditLogId} from '../audit-log-store';
import {ForbiddenError, NotFoundError} from '../errors';
import type {TransactionalUseCase} from '../use-case';
import type {NormalizedEmail} from '../zod';

export interface UpdateOrganizationRequest {
  organizationId: string;
  currentUserEmail: NormalizedEmail;
  name: string;
}

export interface UpdateOrganizationResponse {
  success: boolean;
}

export function createUpdateOrganizationUseCase(): TransactionalUseCase<
  UpdateOrganizationRequest,
  UpdateOrganizationResponse
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

    // Only admins can update organization settings
    if (organization.myRole !== 'admin') {
      throw new ForbiddenError('Only organization admins can update settings');
    }

    const user = await tx.users.getByEmail(req.currentUserEmail);
    assert(user, 'Current user not found');

    await tx.organizations.updateById({
      id: req.organizationId,
      name: req.name,
      updatedAt: now,
    });

    await tx.auditLogs.create({
      id: createAuditLogId(),
      createdAt: now,
      projectId: null,
      userId: user.id,
      configId: null,
      payload: {
        type: 'organization_updated',
        organization: {
          id: req.organizationId,
          name: req.name,
        },
        before: {
          name: organization.name,
        },
        after: {
          name: req.name,
        },
      },
    });

    return {success: true};
  };
}
