import {Kysely, type Selectable} from 'kysely';
import {z} from 'zod';
import type {DB, Workspaces} from '../db';
import {createUuidV7} from '../uuid';
import type {NormalizedEmail} from '../zod';

export type WorkspaceId = string;

export function createWorkspaceId() {
  return createUuidV7() as WorkspaceId;
}

export function WorkspaceName() {
  return z.string().min(1).max(100).describe('Workspace name, 1-100 characters long');
}

export function Workspace() {
  return z.object({
    id: z.string(),
    name: WorkspaceName(),
    autoAddNewUsers: z.boolean(),
    personalWorkspaceUserId: z.number().nullable().optional(),
    createdAt: z.date(),
    updatedAt: z.date(),
  });
}

export interface Workspace extends z.infer<ReturnType<typeof Workspace>> {
  autoAddNewUsers: boolean;
  personalWorkspaceUserId?: number | null;
}

export interface WorkspaceInfo {
  id: string;
  name: string;
  autoAddNewUsers: boolean;
  createdAt: Date;
  updatedAt: Date;
  myRole: 'admin' | 'member';
  isPersonal: boolean;
}

export class WorkspaceStore {
  constructor(private readonly db: Kysely<DB>) {}

  async getAllTheUserMemberOf(params: {
    currentUserEmail: NormalizedEmail;
  }): Promise<WorkspaceInfo[]> {
    const workspacesQuery = this.db
      .selectFrom('workspaces')
      .orderBy('workspaces.name')
      .innerJoin('workspace_members', jb =>
        jb.on(eb =>
          eb.and([
            eb('workspace_members.workspace_id', '=', eb.ref('workspaces.id')),
            eb('workspace_members.user_email_normalized', '=', params.currentUserEmail),
          ]),
        ),
      )
      .select([
        'workspaces.id',
        'workspaces.name',
        'workspaces.auto_add_new_users',
        'workspaces.created_at',
        'workspaces.updated_at',
        'workspace_members.role as myRole',
        'workspaces.personal_workspace_user_id',
      ]);

    const rows = await workspacesQuery.execute();

    return rows.map(w => ({
      id: w.id,
      name: w.name,
      autoAddNewUsers: w.auto_add_new_users,
      createdAt: w.created_at,
      updatedAt: w.updated_at,
      myRole: w.myRole,
      isPersonal: w.personal_workspace_user_id !== null,
    }));
  }

  async getById(params: {
    id: string;
    currentUserEmail: NormalizedEmail;
  }): Promise<(Workspace & {myRole?: 'admin' | 'member'}) | undefined> {
    const row = await this.db
      .selectFrom('workspaces')
      .leftJoin('workspace_members', jb =>
        jb.on(eb =>
          eb.and([
            eb('workspace_members.workspace_id', '=', eb.ref('workspaces.id')),
            eb('workspace_members.user_email_normalized', '=', params.currentUserEmail),
          ]),
        ),
      )
      .select([
        'workspaces.id',
        'workspaces.name',
        'workspaces.auto_add_new_users',
        'workspaces.created_at',
        'workspaces.updated_at',
        'workspace_members.role as myRole',
        'workspaces.personal_workspace_user_id',
      ])
      .where('workspaces.id', '=', params.id)
      .executeTakeFirst();

    if (!row) {
      return undefined;
    }

    return {
      ...mapWorkspace(row),
      myRole: row.myRole ?? undefined,
    };
  }

  async getByIdSimple(id: string): Promise<Workspace | undefined> {
    const result = await this.db
      .selectFrom('workspaces')
      .selectAll()
      .where('id', '=', id)
      .executeTakeFirst();

    if (result) {
      return mapWorkspace(result);
    }

    return undefined;
  }

  async create(workspace: Workspace): Promise<void> {
    await this.db
      .insertInto('workspaces')
      .values({
        id: workspace.id,
        name: workspace.name,
        auto_add_new_users: workspace.autoAddNewUsers,
        personal_workspace_user_id: workspace.personalWorkspaceUserId ?? null,
        created_at: workspace.createdAt,
        updated_at: workspace.updatedAt,
      })
      .execute();
  }

  async updateById(params: {id: string; name: string; updatedAt: Date}): Promise<void> {
    await this.db
      .updateTable('workspaces')
      .set({
        name: params.name,
        updated_at: params.updatedAt,
      })
      .where('id', '=', params.id)
      .execute();
  }

  async deleteById(id: string): Promise<void> {
    await this.db.deleteFrom('workspaces').where('id', '=', id).execute();
  }

  async countProjectsByWorkspace(workspaceId: string): Promise<number> {
    const row = await this.db
      .selectFrom('projects')
      .where('workspace_id', '=', workspaceId)
      .select(eb => eb.fn.countAll<number>().as('cnt'))
      .executeTakeFirst();
    return row ? row.cnt : 0;
  }

  async getPersonalWorkspaceByUserId(userId: number): Promise<Workspace | undefined> {
    const row = await this.db
      .selectFrom('workspaces')
      .where('personal_workspace_user_id', '=', userId)
      .selectAll()
      .executeTakeFirst();

    if (!row) {
      return undefined;
    }

    return mapWorkspace(row);
  }
}

function mapWorkspace(workspace: Selectable<Workspaces>): Workspace {
  return {
    id: workspace.id,
    name: workspace.name,
    autoAddNewUsers: workspace.auto_add_new_users,
    personalWorkspaceUserId: workspace.personal_workspace_user_id,
    createdAt: workspace.created_at,
    updatedAt: workspace.updated_at,
  };
}
