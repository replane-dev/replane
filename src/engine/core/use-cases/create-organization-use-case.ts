import assert from 'assert';
import {createAuditLogId} from '../audit-log-store';
import {BadRequestError} from '../errors';
import {createOrganizationId} from '../organization-store';
import type {TransactionalUseCase} from '../use-case';
import type {NormalizedEmail} from '../zod';

export interface CreateOrganizationRequest {
  currentUserEmail: NormalizedEmail;
  name: string;
}

export interface CreateOrganizationResponse {
  organizationId: string;
}

export function createCreateOrganizationUseCase(): TransactionalUseCase<
  CreateOrganizationRequest,
  CreateOrganizationResponse
> {
  return async (ctx, tx, req) => {
    const now = new Date();

    const user = await tx.users.getByEmail(req.currentUserEmail);
    assert(user, 'Current user not found');

    const organizationId = createOrganizationId();

    await tx.organizations.create({
      id: organizationId,
      name: req.name,
      createdAt: now,
      updatedAt: now,
    });

    // Make the creator an admin
    await tx.organizationMembers.create([
      {
        organizationId,
        email: req.currentUserEmail,
        role: 'admin',
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
        type: 'organization_created',
        organization: {
          id: organizationId,
          name: req.name,
        },
      },
    });

    return {organizationId};
  };
}
