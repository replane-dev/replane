import type {Kysely} from 'kysely';
import type {Context} from '../context';
import type {DB} from '../db';
import type {EventHubPublisher} from '../event-hub';
import type {AppHubEvents} from '../replica';

export interface SdkKeyRow {
  id: string;
  createdAt: Date;
  keyHash: string;
  name: string;
  description: string;
  projectId: string;
  environmentId: string;
  environmentName: string;
}

export class SdkKeyStore {
  constructor(
    private readonly db: Kysely<DB>,
    private readonly hub: EventHubPublisher<AppHubEvents>,
  ) {}

  async list(params: {projectId: string; environmentId?: string}) {
    let query = this.db
      .selectFrom('sdk_keys as t')
      .leftJoin('project_environments as pe', 'pe.id', 't.environment_id')
      .select([
        't.id as id',
        't.created_at as created_at',
        't.key_hash as key_hash',
        't.name as name',
        't.description as description',
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
      createdAt: r.created_at,
      keyHash: r.key_hash,
      name: r.name,
      description: r.description,
      environmentId: r.environment_id,
      environmentName: r.environment_name!,
    }));
  }

  async create(
    ctx: Context,
    key: {
      id: string;
      createdAt: Date;
      keyHash: string;
      name: string;
      description: string;
      projectId: string;
      environmentId: string;
    },
  ) {
    await this.db
      .insertInto('sdk_keys')
      .values({
        id: key.id,
        created_at: key.createdAt,
        key_hash: key.keyHash,
        name: key.name,
        description: key.description,
        project_id: key.projectId,
        environment_id: key.environmentId,
      })
      .execute();

    this.hub.pushEvent(ctx, 'sdkKeys', {
      sdkKeyId: key.id,
    });
  }

  async getById(params: {sdkKeyId: string; projectId: string}) {
    const row = await this.db
      .selectFrom('sdk_keys as t')
      .leftJoin('project_environments as pe', 'pe.id', 't.environment_id')
      .select([
        't.id as id',
        't.created_at as created_at',
        't.key_hash as key_hash',
        't.name as name',
        't.description as description',
        't.project_id as project_id',
        't.environment_id as environment_id',
        'pe.name as environment_name',
      ])
      .where('t.id', '=', params.sdkKeyId)
      .where('t.project_id', '=', params.projectId)
      .executeTakeFirst();
    if (!row) return null;
    return {
      id: row.id,
      createdAt: row.created_at,
      keyHash: row.key_hash,
      name: row.name,
      description: row.description,
      projectId: row.project_id,
      environmentId: row.environment_id,
      environmentName: row.environment_name!,
    };
  }

  async deleteById(ctx: Context, id: string) {
    await this.db.deleteFrom('sdk_keys').where('id', '=', id).execute();

    this.hub.pushEvent(ctx, 'sdkKeys', {
      sdkKeyId: id,
    });
  }
}
