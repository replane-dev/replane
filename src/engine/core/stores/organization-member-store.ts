import type {Kysely} from 'kysely';
import type {DB} from '../db';
import {normalizeEmail} from '../utils';
import type {NormalizedEmail} from '../zod';

export type OrganizationMemberRole = 'admin' | 'member';

export interface NewOrganizationMember {
  organizationId: string;
  email: string;
  role: OrganizationMemberRole;
  createdAt: Date;
  updatedAt: Date;
}

export class OrganizationMemberStore {
  constructor(private readonly db: Kysely<DB>) {}

  async getByOrganizationIdAndEmail(params: {organizationId: string; userEmail: NormalizedEmail}) {
    return await this.db
      .selectFrom('organization_members')
      .selectAll()
      .where('organization_id', '=', params.organizationId)
      .where('user_email_normalized', '=', normalizeEmail(params.userEmail))
      .executeTakeFirst();
  }

  async getByOrganizationId(organizationId: string) {
    return await this.db
      .selectFrom('organization_members')
      .selectAll()
      .where('organization_id', '=', organizationId)
      .execute();
  }

  async getByUserEmail(userEmail: NormalizedEmail) {
    return await this.db
      .selectFrom('organization_members')
      .selectAll()
      .where('user_email_normalized', '=', normalizeEmail(userEmail))
      .execute();
  }

  async create(organizationMembers: NewOrganizationMember[]) {
    if (organizationMembers.length === 0) {
      return;
    }
    await this.db
      .insertInto('organization_members')
      .values(
        organizationMembers.map(x => ({
          organization_id: x.organizationId,
          user_email_normalized: normalizeEmail(x.email),
          role: x.role,
          created_at: x.createdAt,
          updated_at: x.updatedAt,
        })),
      )
      .execute();
  }

  async delete(organizationId: string, userEmail: string) {
    await this.db
      .deleteFrom('organization_members')
      .where('organization_id', '=', organizationId)
      .where('user_email_normalized', '=', normalizeEmail(userEmail))
      .execute();
  }

  async updateRole(params: {
    organizationId: string;
    userEmail: string;
    role: OrganizationMemberRole;
    updatedAt: Date;
  }) {
    await this.db
      .updateTable('organization_members')
      .set({
        role: params.role,
        updated_at: params.updatedAt,
      })
      .where('organization_id', '=', params.organizationId)
      .where('user_email_normalized', '=', normalizeEmail(params.userEmail))
      .execute();
  }
}
