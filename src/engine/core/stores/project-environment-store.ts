import type {Kysely} from 'kysely';
import type {DB} from '../db';

export interface ProjectEnvironment {
  id: string;
  projectId: string;
  name: string;
  order: number;
  createdAt: Date;
  updatedAt: Date;
}

export class ProjectEnvironmentStore {
  constructor(private readonly db: Kysely<DB>) {}

  async getById(params: {
    environmentId: string;
    projectId: string;
  }): Promise<ProjectEnvironment | null> {
    const row = await this.db
      .selectFrom('project_environments')
      .selectAll()
      .where('id', '=', params.environmentId)
      .where('project_id', '=', params.projectId)
      .executeTakeFirst();

    if (!row) return null;

    return this.mapRow(row);
  }

  async getByProjectId(projectId: string): Promise<ProjectEnvironment[]> {
    const rows = await this.db
      .selectFrom('project_environments')
      .selectAll()
      .where('project_id', '=', projectId)
      .orderBy('order', 'asc')
      .execute();

    return rows.map(this.mapRow);
  }

  async getByProjectIdAndName(params: {
    projectId: string;
    name: string;
  }): Promise<ProjectEnvironment | null> {
    const row = await this.db
      .selectFrom('project_environments')
      .selectAll()
      .where('project_id', '=', params.projectId)
      .where('name', '=', params.name)
      .executeTakeFirst();

    if (!row) return null;

    return this.mapRow(row);
  }

  async create(environment: ProjectEnvironment): Promise<void> {
    await this.db
      .insertInto('project_environments')
      .values({
        id: environment.id,
        project_id: environment.projectId,
        name: environment.name,
        order: environment.order,
        created_at: environment.createdAt,
        updated_at: environment.updatedAt,
      })
      .execute();
  }

  async update(params: {
    id: string;
    name?: string;
    order?: number;
    updatedAt: Date;
  }): Promise<void> {
    const updates: any = {
      updated_at: params.updatedAt,
    };

    if (params.name !== undefined) {
      updates.name = params.name;
    }

    if (params.order !== undefined) {
      updates.order = params.order;
    }

    await this.db
      .updateTable('project_environments')
      .set(updates)
      .where('id', '=', params.id)
      .execute();
  }

  async delete(id: string): Promise<void> {
    await this.db.deleteFrom('project_environments').where('id', '=', id).execute();
  }

  private mapRow(row: {
    id: string;
    project_id: string;
    name: string;
    order: number;
    created_at: Date;
    updated_at: Date;
  }): ProjectEnvironment {
    return {
      id: row.id,
      projectId: row.project_id,
      name: row.name,
      order: row.order,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    };
  }
}
