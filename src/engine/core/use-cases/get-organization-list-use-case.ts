import type {OrganizationInfo} from '../stores/organization-store';
import type {TransactionalUseCase} from '../use-case';
import type {NormalizedEmail} from '../zod';

export interface GetOrganizationListRequest {
  currentUserEmail: NormalizedEmail;
}

export type GetOrganizationListResponse = OrganizationInfo[];

export function createGetOrganizationListUseCase(): TransactionalUseCase<
  GetOrganizationListRequest,
  GetOrganizationListResponse
> {
  return async (ctx, tx, req) => {
    const organizations = await tx.organizations.getAll({
      currentUserEmail: req.currentUserEmail,
    });

    // Only return organizations where user is a member
    return organizations.filter(org => org.myRole !== undefined);
  };
}
