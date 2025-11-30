import {NotFoundError} from '../errors';
import type {Organization} from '../stores/organization-store';
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
    await tx.permissionService.ensureIsOrganizationMember(ctx, {
      organizationId: req.organizationId,
      currentUserEmail: req.currentUserEmail,
    });

    const organization = await tx.organizations.getById({
      id: req.organizationId,
      currentUserEmail: req.currentUserEmail,
    });

    if (!organization) {
      throw new NotFoundError('Organization not found');
    }

    return organization;
  };
}
