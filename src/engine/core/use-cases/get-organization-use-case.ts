import {ForbiddenError, NotFoundError} from '../errors';
import type {Organization} from '../organization-store';
import type {TransactionalUseCase} from '../use-case';
import type {NormalizedEmail} from '../zod';

export interface GetOrganizationRequest {
  organizationId: string;
  currentUserEmail: NormalizedEmail;
}

export type GetOrganizationResponse = Organization & {myRole?: 'admin' | 'member'};

export function createGetOrganizationUseCase(): TransactionalUseCase<
  GetOrganizationRequest,
  GetOrganizationResponse
> {
  return async (ctx, tx, req) => {
    const organization = await tx.organizations.getById({
      id: req.organizationId,
      currentUserEmail: req.currentUserEmail,
    });

    if (!organization) {
      throw new NotFoundError('Organization not found');
    }

    // Check if user is a member
    if (!organization.myRole) {
      throw new ForbiddenError('You are not a member of this organization');
    }

    return organization;
  };
}
