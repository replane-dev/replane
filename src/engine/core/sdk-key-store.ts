import type {Kysely} from 'kysely';
import type {DB} from './db';

export interface SdkKeyRow {
  id: string;
  creatorId: number;
  createdAt: Date;
  tokenHash: string;
  name: string;
  description: string;
  creatorEmail?: string | null;
  projectId: string;
  environmentId: string;
  environmentName: string;
}

export class SdkKeyStore {
  constructor(private readonly db: Kysely<DB>) {}

  async list(params: {projectId: string; environmentId?: string}) {
    let query = this.db
      .selectFrom('sdk_keys as t')
      .leftJoin('users as u', 'u.id', 't.creator_id')
      .leftJoin('project_environments as pe', 'pe.id', 't.environment_id')
      .select([
        't.id as id',
        't.creator_id as creator_id',
        't.created_at as created_at',
        't.token_hash as token_hash',
        't.name as name',
        't.description as description',
        'u.email as creator_email',
        't.environment_id as environment_id',
        'pe.name as environment_name',
      ])
      .where('t.project_id', '=', params.projectId);

    if (params.environmentId) {
      query = query.where('t.environment_id', '=', params.environmentId);
    }
    const rows = await query.orderBy('t.created_at', 'desc').execute();

    return rows.map(r => ({
      id: r.id,
      creatorId: r.creator_id!,
      createdAt: r.created_at,
      tokenHash: r.token_hash,
      name: r.name,
      description: r.description,
      creatorEmail: r.creator_email ?? null,
      environmentId: r.environment_id,
      environmentName: r.environment_name!,
    }));
  }

  async create(key: {
    id: string;
    creatorId: number;
    createdAt: Date;
    tokenHash: string;
    name: string;
    description: string;
    projectId: string;
    environmentId: string;
  }) {
    await this.db
      .insertInto('sdk_keys')
      .values({
        id: key.id,
        creator_id: key.creatorId,
        created_at: key.createdAt,
        token_hash: key.tokenHash,
        name: key.name,
        description: key.description,
        project_id: key.projectId,
        environment_id: key.environmentId,
      })
      .execute();
  }

  async getById(params: {apiKeyId: string; projectId: string}) {
    const row = await this.db
      .selectFrom('sdk_keys as t')
      .leftJoin('users as u', 'u.id', 't.creator_id')
      .leftJoin('project_environments as pe', 'pe.id', 't.environment_id')
      .select([
        't.id as id',
        't.creator_id as creator_id',
        't.created_at as created_at',
        't.token_hash as token_hash',
        't.name as name',
        't.description as description',
        'u.email as creator_email',
        't.project_id as project_id',
        't.environment_id as environment_id',
        'pe.name as environment_name',
      ])
      .where('t.id', '=', params.apiKeyId)
      .where('t.project_id', '=', params.projectId)
      .executeTakeFirst();
    if (!row) return null;
    return {
      id: row.id,
      creatorId: row.creator_id!,
      createdAt: row.created_at,
      tokenHash: row.token_hash,
      name: row.name,
      description: row.description,
      creatorEmail: row.creator_email ?? null,
      projectId: row.project_id,
      environmentId: row.environment_id,
      environmentName: row.environment_name!,
    };
  }

  async deleteById(id: string) {
    await this.db.deleteFrom('sdk_keys').where('id', '=', id).execute();
  }
}
