import type {Kysely} from 'kysely';
import type {DB} from './db';

export interface ApiTokenRow {
  id: string;
  creatorId: number;
  createdAt: Date;
  tokenHash: string;
  name: string;
  description: string;
  creatorEmail?: string | null;
  projectId: string;
}

export class ApiTokenStore {
  constructor(private readonly db: Kysely<DB>) {}

  async list(params: {projectId: string}) {
    const rows = await this.db
      .selectFrom('api_tokens as t')
      .leftJoin('users as u', 'u.id', 't.creator_id')
      .select([
        't.id as id',
        't.creator_id as creator_id',
        't.created_at as created_at',
        't.token_hash as token_hash',
        't.name as name',
        't.description as description',
        'u.email as creator_email',
      ])
      .where('t.project_id', '=', params.projectId)
      .orderBy('t.created_at', 'desc')
      .execute();
    return rows.map(r => ({
      id: r.id,
      creatorId: r.creator_id!,
      createdAt: r.created_at,
      tokenHash: r.token_hash,
      name: r.name,
      description: r.description,
      creatorEmail: r.creator_email ?? null,
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
  }) {
    await this.db
      .insertInto('api_tokens')
      .values({
        id: key.id,
        creator_id: key.creatorId,
        created_at: key.createdAt,
        token_hash: key.tokenHash,
        name: key.name,
        description: key.description,
        project_id: key.projectId,
      })
      .execute();
  }

  async getById(params: {apiKeyId: string; projectId: string}) {
    const row = await this.db
      .selectFrom('api_tokens as t')
      .leftJoin('users as u', 'u.id', 't.creator_id')
      .select([
        't.id as id',
        't.creator_id as creator_id',
        't.created_at as created_at',
        't.token_hash as token_hash',
        't.name as name',
        't.description as description',
        'u.email as creator_email',
        't.project_id as project_id',
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
    } satisfies ApiTokenRow;
  }

  async deleteById(id: string) {
    await this.db.deleteFrom('api_tokens').where('id', '=', id).execute();
  }
}
