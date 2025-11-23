import type {Kysely} from 'kysely';
import type {DB} from './db';
import {normalizeEmail} from './utils';
import type {NormalizedEmail} from './zod';

export type ProjectUserRole = 'admin' | 'maintainer';

export interface NewProjectUser {
  projectId: string;
  email: string;
  role: ProjectUserRole;
  createdAt: Date;
  updatedAt: Date;
}

export class ProjectUserStore {
  constructor(private readonly db: Kysely<DB>) {}

  async getByProjectIdAndEmail(params: {projectId: string; userEmail: NormalizedEmail}) {
    return await this.db
      .selectFrom('project_users')
      .selectAll()
      .where('project_id', '=', params.projectId)
      .where('user_email_normalized', '=', normalizeEmail(params.userEmail))
      .executeTakeFirst();
  }

  async getByProjectId(projectId: string) {
    return await this.db
      .selectFrom('project_users')
      .selectAll()
      .where('project_id', '=', projectId)
      .execute();
  }

  async create(projectUsers: NewProjectUser[]) {
    if (projectUsers.length === 0) {
      return;
    }
    await this.db
      .insertInto('project_users')
      .values(
        projectUsers.map(x => ({
          project_id: x.projectId,
          user_email_normalized: normalizeEmail(x.email),
          role: x.role,
          created_at: x.createdAt,
          updated_at: x.updatedAt,
        })),
      )
      .execute();
  }

  async delete(projectId: string, userEmail: string) {
    await this.db
      .deleteFrom('project_users')
      .where('project_id', '=', projectId)
      .where('user_email_normalized', '=', normalizeEmail(userEmail))
      .execute();
  }
}
