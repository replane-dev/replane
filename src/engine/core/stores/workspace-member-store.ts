import type {Kysely} from 'kysely';
import type {DB} from '../db';
import {normalizeEmail} from '../utils';
import type {NormalizedEmail} from '../zod';

export type WorkspaceMemberRole = 'admin' | 'member';

export interface NewWorkspaceMember {
  workspaceId: string;
  email: string;
  role: WorkspaceMemberRole;
  createdAt: Date;
  updatedAt: Date;
}

export class WorkspaceMemberStore {
  constructor(private readonly db: Kysely<DB>) {}

  async getByWorkspaceIdAndEmail(params: {workspaceId: string; userEmail: NormalizedEmail}) {
    return await this.db
      .selectFrom('workspace_members')
      .selectAll()
      .where('workspace_id', '=', params.workspaceId)
      .where('user_email_normalized', '=', normalizeEmail(params.userEmail))
      .executeTakeFirst();
  }

  async getByWorkspaceId(workspaceId: string) {
    return await this.db
      .selectFrom('workspace_members')
      .selectAll()
      .where('workspace_id', '=', workspaceId)
      .execute();
  }

  async getByUserEmail(userEmail: NormalizedEmail) {
    return await this.db
      .selectFrom('workspace_members')
      .selectAll()
      .where('user_email_normalized', '=', normalizeEmail(userEmail))
      .execute();
  }

  async create(workspaceMembers: NewWorkspaceMember[]) {
    if (workspaceMembers.length === 0) {
      return;
    }
    await this.db
      .insertInto('workspace_members')
      .values(
        workspaceMembers.map(x => ({
          workspace_id: x.workspaceId,
          user_email_normalized: normalizeEmail(x.email),
          role: x.role,
          created_at: x.createdAt,
          updated_at: x.updatedAt,
        })),
      )
      .execute();
  }

  async delete(workspaceId: string, userEmail: string) {
    await this.db
      .deleteFrom('workspace_members')
      .where('workspace_id', '=', workspaceId)
      .where('user_email_normalized', '=', normalizeEmail(userEmail))
      .execute();
  }

  async updateRole(params: {
    workspaceId: string;
    userEmail: string;
    role: WorkspaceMemberRole;
    updatedAt: Date;
  }) {
    await this.db
      .updateTable('workspace_members')
      .set({
        role: params.role,
        updated_at: params.updatedAt,
      })
      .where('workspace_id', '=', params.workspaceId)
      .where('user_email_normalized', '=', normalizeEmail(params.userEmail))
      .execute();
  }
}
