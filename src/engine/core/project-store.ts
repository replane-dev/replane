import {Kysely, type Selectable} from 'kysely';
import {z} from 'zod';
import type {DB, Projects} from './db';
import {createUuidV7} from './uuid';
import type {NormalizedEmail} from './zod';

export type ProjectId = string;

export function createProjectId() {
  return createUuidV7() as ProjectId;
}

export function ProjectName() {
  return z
    .string()
    .describe(
      'A project name consisting of letters (A-Z, a-z), digits, underscores or hyphens, 1-100 characters long',
    );
}

export function ProjectDescription() {
  return z.string().max(1_000_000);
}

export function Project() {
  return z.object({
    id: z.string(),
    name: ProjectName(),
    description: ProjectDescription(),
    createdAt: z.date(),
    updatedAt: z.date(),
  });
}

export interface Project extends z.infer<ReturnType<typeof Project>> {}

export interface ProjectInfo {
  id: string;
  name: string;
  descriptionPreview: string;
  createdAt: Date;
  updatedAt: Date;
  // role in the project if the current user is a member (owner | admin)
  myRole?: 'owner' | 'admin';
}

export class ProjectStore {
  constructor(private readonly db: Kysely<DB>) {}

  async getAll(params: {currentUserEmail: NormalizedEmail}): Promise<ProjectInfo[]> {
    const projectsQuery = this.db
      .selectFrom('projects')
      .orderBy('projects.name')
      .leftJoin('project_users', jb =>
        jb.on(eb =>
          eb.and([
            eb('project_users.project_id', '=', eb.ref('projects.id')),
            eb('project_users.user_email_normalized', '=', params.currentUserEmail),
          ]),
        ),
      )
      .select([
        'projects.created_at',
        'projects.id',
        'projects.name',
        'projects.description',
        'projects.updated_at',
        'project_users.role as myRole',
      ]);

    const rows = await projectsQuery.execute();

    return rows.map(p => ({
      id: p.id,
      name: p.name,
      descriptionPreview: p.description.substring(0, 100),
      createdAt: p.created_at,
      updatedAt: p.updated_at,
      myRole: p.myRole ?? undefined,
    }));
  }

  async getByName(name: string): Promise<Project | undefined> {
    const result = await this.db
      .selectFrom('projects')
      .selectAll()
      .where('name', '=', name)
      .executeTakeFirst();
    if (result) {
      return mapProject(result);
    }

    return undefined;
  }

  async getById(params: {
    id: string;
    currentUserEmail: NormalizedEmail;
  }): Promise<(Project & {myRole?: 'owner' | 'admin'}) | undefined> {
    const projectsQuery = this.db
      .selectFrom('projects')
      .orderBy('projects.name')
      .leftJoin('project_users', jb =>
        jb.on(eb =>
          eb.and([
            eb('project_users.project_id', '=', eb.ref('projects.id')),
            eb('project_users.user_email_normalized', '=', params.currentUserEmail),
          ]),
        ),
      )
      .select([
        'projects.created_at',
        'projects.id',
        'projects.name',
        'projects.description',
        'projects.updated_at',
        'project_users.role as myRole',
      ]);

    const row = await projectsQuery.where('projects.id', '=', params.id).executeTakeFirst();

    if (!row) {
      return undefined;
    }

    return {
      ...mapProject(row),
      myRole: row.myRole ?? undefined,
    };
  }

  async create(project: Project): Promise<void> {
    await this.db
      .insertInto('projects')
      .values({
        created_at: project.createdAt,
        id: project.id,
        updated_at: project.updatedAt,
        name: project.name,
        description: project.description,
      })
      .execute();
  }

  async updateById(params: {
    id: string;
    name: string;
    description: string;
    updatedAt: Date;
  }): Promise<void> {
    await this.db
      .updateTable('projects')
      .set({
        name: params.name,
        description: params.description,
        updated_at: params.updatedAt,
      })
      .where('id', '=', params.id)
      .execute();
  }

  async delete(name: string): Promise<void> {
    await this.db.deleteFrom('projects').where('name', '=', name).execute();
  }

  async deleteById(id: string): Promise<void> {
    await this.db.deleteFrom('projects').where('id', '=', id).execute();
  }

  async countAll(): Promise<number> {
    const row = await this.db
      .selectFrom('projects')
      .select(eb => eb.fn.countAll<number>().as('cnt'))
      .executeTakeFirst();
    return row ? (row as any).cnt : 0;
  }
}

function mapProject(project: Selectable<Projects>): Project {
  return {
    id: project.id,
    name: project.name,
    description: project.description,
    createdAt: project.created_at,
    updatedAt: project.updated_at,
  };
}
