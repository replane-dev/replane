import type {OrganizationMemberRole} from '../organization-member-store';
import type {TransactionalUseCase} from '../use-case';
import type {NormalizedEmail} from '../zod';

export interface GetOrganizationMembersRequest {
  organizationId: string;
  currentUserEmail: NormalizedEmail;
}

export interface OrganizationMember {
  email: string;
  role: OrganizationMemberRole;
  createdAt: Date;
  updatedAt: Date;
}

export type GetOrganizationMembersResponse = OrganizationMember[];

export function createGetOrganizationMembersUseCase(): TransactionalUseCase<
  GetOrganizationMembersRequest,
  GetOrganizationMembersResponse
> {
  return async (ctx, tx, req) => {
    await tx.permissionService.ensureIsOrganizationMember(ctx, {
      organizationId: req.organizationId,
      currentUserEmail: req.currentUserEmail,
    });

    const members = await tx.organizationMembers.getByOrganizationId(req.organizationId);

    return members.map(m => ({
      email: m.user_email_normalized,
      role: m.role,
      createdAt: m.created_at,
      updatedAt: m.updated_at,
    }));
  };
}
