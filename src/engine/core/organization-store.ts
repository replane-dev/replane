import {Kysely, type Selectable} from 'kysely';
import {z} from 'zod';
import type {DB, Organizations} from './db';
import {createUuidV7} from './uuid';
import type {NormalizedEmail} from './zod';

export type OrganizationId = string;

export function createOrganizationId() {
  return createUuidV7() as OrganizationId;
}

export function OrganizationName() {
  return z.string().min(1).max(100).describe('Organization name, 1-100 characters long');
}

export function Organization() {
  return z.object({
    id: z.string(),
    name: OrganizationName(),
    personalOrgUserId: z.number().nullable().optional(),
    createdAt: z.date(),
    updatedAt: z.date(),
  });
}

export interface Organization extends z.infer<ReturnType<typeof Organization>> {
  personalOrgUserId?: number | null;
}

export interface OrganizationInfo {
  id: string;
  name: string;
  createdAt: Date;
  updatedAt: Date;
  myRole?: 'admin' | 'member';
}

export class OrganizationStore {
  constructor(private readonly db: Kysely<DB>) {}

  async getAll(params: {currentUserEmail: NormalizedEmail}): Promise<OrganizationInfo[]> {
    const organizationsQuery = this.db
      .selectFrom('organizations')
      .orderBy('organizations.name')
      .leftJoin('organization_members', jb =>
        jb.on(eb =>
          eb.and([
            eb('organization_members.organization_id', '=', eb.ref('organizations.id')),
            eb('organization_members.user_email_normalized', '=', params.currentUserEmail),
          ]),
        ),
      )
      .select([
        'organizations.id',
        'organizations.name',
        'organizations.created_at',
        'organizations.updated_at',
        'organization_members.role as myRole',
      ]);

    const rows = await organizationsQuery.execute();

    return rows.map(o => ({
      id: o.id,
      name: o.name,
      createdAt: o.created_at,
      updatedAt: o.updated_at,
      myRole: o.myRole ?? undefined,
    }));
  }

  async getById(params: {
    id: string;
    currentUserEmail: NormalizedEmail;
  }): Promise<(Organization & {myRole?: 'admin' | 'member'}) | undefined> {
    const row = await this.db
      .selectFrom('organizations')
      .leftJoin('organization_members', jb =>
        jb.on(eb =>
          eb.and([
            eb('organization_members.organization_id', '=', eb.ref('organizations.id')),
            eb('organization_members.user_email_normalized', '=', params.currentUserEmail),
          ]),
        ),
      )
      .select([
        'organizations.id',
        'organizations.name',
        'organizations.created_at',
        'organizations.updated_at',
        'organization_members.role as myRole',
        'organizations.personal_org_user_id',
      ])
      .where('organizations.id', '=', params.id)
      .executeTakeFirst();

    if (!row) {
      return undefined;
    }

    return {
      ...mapOrganization(row),
      myRole: row.myRole ?? undefined,
    };
  }

  async getByIdSimple(id: string): Promise<Organization | undefined> {
    const result = await this.db
      .selectFrom('organizations')
      .selectAll()
      .where('id', '=', id)
      .executeTakeFirst();

    if (result) {
      return mapOrganization(result);
    }

    return undefined;
  }

  async create(organization: Organization): Promise<void> {
    await this.db
      .insertInto('organizations')
      .values({
        id: organization.id,
        name: organization.name,
        personal_org_user_id: organization.personalOrgUserId ?? null,
        created_at: organization.createdAt,
        updated_at: organization.updatedAt,
      })
      .execute();
  }

  async updateById(params: {id: string; name: string; updatedAt: Date}): Promise<void> {
    await this.db
      .updateTable('organizations')
      .set({
        name: params.name,
        updated_at: params.updatedAt,
      })
      .where('id', '=', params.id)
      .execute();
  }

  async deleteById(id: string): Promise<void> {
    await this.db.deleteFrom('organizations').where('id', '=', id).execute();
  }

  async countAll(): Promise<number> {
    const row = await this.db
      .selectFrom('organizations')
      .select(eb => eb.fn.countAll<number>().as('cnt'))
      .executeTakeFirst();
    return row ? row.cnt : 0;
  }

  async countProjectsByOrganization(organizationId: string): Promise<number> {
    const row = await this.db
      .selectFrom('projects')
      .where('organization_id', '=', organizationId)
      .select(eb => eb.fn.countAll<number>().as('cnt'))
      .executeTakeFirst();
    return row ? row.cnt : 0;
  }

  async getPersonalOrganizationByUserId(userId: number): Promise<Organization | undefined> {
    const row = await this.db
      .selectFrom('organizations')
      .where('personal_org_user_id', '=', userId)
      .selectAll()
      .executeTakeFirst();

    if (!row) {
      return undefined;
    }

    return mapOrganization(row);
  }
}

function mapOrganization(organization: Selectable<Organizations>): Organization {
  return {
    id: organization.id,
    name: organization.name,
    personalOrgUserId: organization.personal_org_user_id,
    createdAt: organization.created_at,
    updatedAt: organization.updated_at,
  };
}
