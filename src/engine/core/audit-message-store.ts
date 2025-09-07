import type {Kysely, Selectable} from 'kysely';
import type {ConfigId} from './config-store';
import type {AuditMessages, DB, JsonValue} from './db';
import {createUuidV7} from './uuid';

export type AuditMessageId = string;

export function createAuditMessageId() {
  return createUuidV7() as AuditMessageId;
}

export interface BaseAuditMessagePayload<TType extends string> {
  type: TType;
}

export interface AuditMessagePayloadConfig {
  id: ConfigId;
  name: string;
  value: unknown;
  description: string;
  schema: unknown;
  creatorId: number;
  createdAt: Date;
  updatedAt: Date;
  version: number;
}

export interface ConfigCreatedAuditMessagePayload
  extends BaseAuditMessagePayload<'config_created'> {
  config: AuditMessagePayloadConfig;
}

export interface ConfigUpdatedAuditMessagePayload
  extends BaseAuditMessagePayload<'config_updated'> {
  before: AuditMessagePayloadConfig;
  after: AuditMessagePayloadConfig;
}

export interface ConfigDeletedAuditMessagePayload
  extends BaseAuditMessagePayload<'config_deleted'> {
  config: AuditMessagePayloadConfig;
}

export interface ConfigVersionRestoredAuditMessagePayload
  extends BaseAuditMessagePayload<'config_version_restored'> {
  before: AuditMessagePayloadConfig;
  restoredFromVersion: number;
  after: AuditMessagePayloadConfig;
}

export interface ApiKeyCreatedAuditMessagePayload
  extends BaseAuditMessagePayload<'api_key_created'> {
  apiKey: {
    id: string;
    name: string;
    description: string;
    createdAt: Date;
  };
}

export interface ApiKeyDeletedAuditMessagePayload
  extends BaseAuditMessagePayload<'api_key_deleted'> {
  apiKey: {
    id: string;
    name: string;
    description: string;
    createdAt: Date;
  };
}

export interface ConfigMembersChangedAuditMessagePayload
  extends BaseAuditMessagePayload<'config_members_changed'> {
  config: AuditMessagePayloadConfig;
  added: Array<{email: string; role: string}>;
  removed: Array<{email: string; role: string}>;
}

export type AuditMessagePayload =
  | ConfigCreatedAuditMessagePayload
  | ConfigUpdatedAuditMessagePayload
  | ConfigDeletedAuditMessagePayload
  | ConfigVersionRestoredAuditMessagePayload
  | ApiKeyCreatedAuditMessagePayload
  | ApiKeyDeletedAuditMessagePayload
  | ConfigMembersChangedAuditMessagePayload;

export interface AuditMessage {
  id: AuditMessageId;
  userId: number | null;
  configId: ConfigId | null;
  payload: AuditMessagePayload;
  createdAt: Date;
}

export class AuditMessageStore {
  constructor(private readonly db: Kysely<DB>) {}

  async list(params: {
    gt?: Date;
    lt?: Date;
    gte?: Date;
    lte: Date;
    userIds?: number[];
    configIds?: ConfigId[];
    limit: number;
    orderBy: 'created_at desc, id desc';
    after?: {
      createdAt: Date;
      id: AuditMessageId;
    };
  }): Promise<AuditMessage[]> {
    let query = this.db
      .selectFrom('audit_messages')
      .orderBy('created_at', 'desc')
      .orderBy('id', 'desc');

    if (params.gt) {
      query = query.where('created_at', '>', params.gt);
    }

    if (params.gte) {
      query = query.where('created_at', '>=', params.gte);
    }

    if (params.lt) {
      query = query.where('created_at', '<', params.lt);
    }

    if (params.lte) {
      query = query.where('created_at', '<=', params.lte);
    }

    if (params.after) {
      const after = params.after;
      query = query.where(eb =>
        eb.or([
          eb('created_at', '=', after.createdAt).and('id', '<', after.id),
          eb('created_at', '<', after.createdAt),
        ]),
      );
    }

    return await query
      .selectAll()
      .execute()
      .then(x => x.map(toAuditMessage));
  }

  async create(message: AuditMessage) {
    await this.db
      .insertInto('audit_messages')
      .values([
        {
          id: message.id,
          created_at: message.createdAt,
          config_id: message.configId,
          payload: message.payload as unknown as JsonValue,
          user_id: message.userId,
        },
      ])
      .execute();
  }
}

function toAuditMessage(message: Selectable<AuditMessages>): AuditMessage {
  return {
    configId: message.config_id,
    createdAt: message.created_at,
    id: message.id,
    payload: message.payload as unknown as AuditMessagePayload,
    userId: message.user_id,
  };
}
