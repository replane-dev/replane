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
}

export class ApiTokenStore {
  constructor(private readonly db: Kysely<DB>) {}

  async list() {
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

  async create(token: {
    id: string;
    creatorId: number;
    createdAt: Date;
    tokenHash: string;
    name: string;
    description: string;
  }) {
    await this.db
      .insertInto('api_tokens')
      .values({
        id: token.id,
        creator_id: token.creatorId,
        created_at: token.createdAt,
        token_hash: token.tokenHash,
        name: token.name,
        description: token.description,
      })
      .execute();
  }

  async getById(id: string) {
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
      ])
      .where('t.id', '=', id)
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
    } satisfies ApiTokenRow;
  }

  async deleteById(id: string) {
    await this.db.deleteFrom('api_tokens').where('id', '=', id).execute();
  }
}
