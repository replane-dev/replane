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
  projectId: string;
  description: string;
  schema: unknown;
  overrides: unknown;
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

export interface ProjectCreatedAuditMessagePayload
  extends BaseAuditMessagePayload<'project_created'> {
  project: {
    id: string;
    name: string;
    description: string;
    createdAt: Date;
  };
}

export interface ProjectUpdatedAuditMessagePayload
  extends BaseAuditMessagePayload<'project_updated'> {
  before: {
    id: string;
    name: string;
    description: string;
    createdAt: Date;
    updatedAt: Date;
  };
  after: {
    id: string;
    name: string;
    description: string;
    createdAt: Date;
    updatedAt: Date;
  };
}

export interface ProjectMembersChangedAuditMessagePayload
  extends BaseAuditMessagePayload<'project_members_changed'> {
  added: Array<{email: string; role: string}>;
  removed: Array<{email: string; role: string}>;
}

export interface ProjectDeletedAuditMessagePayload
  extends BaseAuditMessagePayload<'project_deleted'> {
  project: {
    id: string;
    name: string;
    description: string;
    createdAt: Date;
    updatedAt: Date;
  };
}

export interface ConfigProposalCreatedAuditMessagePayload
  extends BaseAuditMessagePayload<'config_proposal_created'> {
  proposalId: string;
  configId: string;
  proposedDelete?: boolean;
  proposedValue?: {newValue: unknown};
  proposedDescription?: string;
  proposedSchema?: {newSchema: unknown};
  proposedOverrides?: {newOverrides: unknown};
  proposedMembers?: {newMembers: Array<{email: string; role: string}>};
  message?: string;
}

export interface ConfigProposalRejectedAuditMessagePayload
  extends BaseAuditMessagePayload<'config_proposal_rejected'> {
  proposalId: string;
  configId: string;
  rejectedInFavorOfProposalId?: string;
  proposedDelete?: boolean;
  proposedValue?: {newValue: unknown};
  proposedDescription?: string;
  proposedSchema?: {newSchema: unknown};
  proposedOverrides?: {newOverrides: unknown};
  proposedMembers?: {newMembers: Array<{email: string; role: string}>};
}

export interface ConfigProposalApprovedAuditMessagePayload
  extends BaseAuditMessagePayload<'config_proposal_approved'> {
  proposalId: string;
  configId: string;
  proposedDelete?: boolean;
  proposedValue?: {newValue: unknown};
  proposedDescription?: string;
  proposedSchema?: {newSchema: unknown};
  proposedOverrides?: {newOverrides: unknown};
  proposedMembers?: {newMembers: Array<{email: string; role: string}>};
}

export type AuditMessagePayload =
  | ConfigCreatedAuditMessagePayload
  | ConfigUpdatedAuditMessagePayload
  | ConfigDeletedAuditMessagePayload
  | ConfigVersionRestoredAuditMessagePayload
  | ApiKeyCreatedAuditMessagePayload
  | ApiKeyDeletedAuditMessagePayload
  | ConfigMembersChangedAuditMessagePayload
  | ProjectCreatedAuditMessagePayload
  | ProjectUpdatedAuditMessagePayload
  | ProjectMembersChangedAuditMessagePayload
  | ProjectDeletedAuditMessagePayload
  | ConfigProposalCreatedAuditMessagePayload
  | ConfigProposalRejectedAuditMessagePayload
  | ConfigProposalApprovedAuditMessagePayload;

export interface AuditMessage {
  id: AuditMessageId;
  userId: number | null;
  configId: ConfigId | null;
  payload: AuditMessagePayload;
  createdAt: Date;
  projectId: string | null;
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
    projectId?: string;
    startWith?: {
      createdAt: Date;
      id: AuditMessageId;
    };
  }): Promise<AuditMessage[]> {
    let query = this.db
      .selectFrom('audit_messages')
      .orderBy('created_at', 'desc')
      .orderBy('id', 'desc');

    if (params.projectId) {
      query = query.where('project_id', '=', params.projectId);
    }

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

    if (params.startWith) {
      const startWith = params.startWith;
      query = query.where(eb =>
        eb.or([
          eb('created_at', '=', startWith.createdAt).and('id', '<=', startWith.id),
          eb('created_at', '<', startWith.createdAt),
        ]),
      );
    }

    if (params.userIds && params.userIds.length > 0) {
      query = query.where('user_id', 'in', params.userIds);
    }

    if (params.configIds && params.configIds.length > 0) {
      query = query.where('config_id', 'in', params.configIds);
    }

    return await query
      .selectAll()
      .limit(params.limit)
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
          project_id: message.projectId,
        },
      ])
      .execute();
  }

  async getById(id: AuditMessageId): Promise<AuditMessage | undefined> {
    const row = await this.db
      .selectFrom('audit_messages')
      .selectAll()
      .where('id', '=', id)
      .executeTakeFirst();
    return row ? toAuditMessage(row) : undefined;
  }
}

function toAuditMessage(message: Selectable<AuditMessages>): AuditMessage {
  return {
    configId: message.config_id,
    createdAt: message.created_at,
    id: message.id,
    payload: message.payload as unknown as AuditMessagePayload,
    userId: message.user_id,
    projectId: message.project_id,
  };
}
