import type {Kysely, Selectable} from 'kysely';
import type {AuditLogs, DB} from '../db';
import {deserializeJson, serializeJson} from '../store-utils';
import {createUuidV7} from '../uuid';
import type {ConfigId} from './config-store';

export type AuditLogId = string;

export function createAuditLogId() {
  return createUuidV7() as AuditLogId;
}

export interface BaseAuditLogPayload<TType extends string> {
  type: TType;
}

export interface AuditLogPayloadConfig {
  id: ConfigId;
  name: string;
  projectId: string;
  description: string;
  creatorId: number;
  createdAt: Date;
  version: number;
}

export interface ConfigCreatedAuditLogPayload extends BaseAuditLogPayload<'config_created'> {
  config: AuditLogPayloadConfig;
}

export interface ConfigUpdatedAuditLogPayload extends BaseAuditLogPayload<'config_updated'> {
  before: AuditLogPayloadConfig;
  after: AuditLogPayloadConfig;
}

export interface ConfigDeletedAuditLogPayload extends BaseAuditLogPayload<'config_deleted'> {
  config: AuditLogPayloadConfig;
}

export interface ConfigVersionRestoredAuditLogPayload
  extends BaseAuditLogPayload<'config_version_restored'> {
  before: AuditLogPayloadConfig;
  restoredFromVersion: number;
  after: AuditLogPayloadConfig;
}

export interface AuditLogPayloadConfigVariant {
  id: string;
  configId: string;
  configName: string;
  environmentId: string | null;
  environmentName: string;
  value: unknown;
  schema: unknown | null;
  overrides: unknown;
  version: number;
}

export interface ConfigVariantUpdatedAuditLogPayload
  extends BaseAuditLogPayload<'config_variant_updated'> {
  before: AuditLogPayloadConfigVariant;
  after: AuditLogPayloadConfigVariant;
}

export interface ConfigVariantVersionRestoredAuditLogPayload
  extends BaseAuditLogPayload<'config_variant_version_restored'> {
  environmentId: string;
  restoredFromVersion: number;
  before: {
    variantId: string;
    configId: string;
    environmentId: string;
    value: unknown;
    schema: unknown | null;
    updatedAt: Date;
    version: number;
    overrides: unknown;
  };
  after: {
    variantId: string;
    configId: string;
    environmentId: string;
    value: unknown;
    schema: unknown | null;
    updatedAt: Date;
    version: number;
    overrides: unknown;
  };
}

export interface ApiKeyCreatedAuditLogPayload extends BaseAuditLogPayload<'api_key_created'> {
  apiKey: {
    id: string;
    name: string;
    description: string;
    createdAt: Date;
  };
}

export interface ApiKeyDeletedAuditLogPayload extends BaseAuditLogPayload<'api_key_deleted'> {
  apiKey: {
    id: string;
    name: string;
    description: string;
    createdAt: Date;
  };
}

export interface ConfigMembersChangedAuditLogPayload
  extends BaseAuditLogPayload<'config_members_changed'> {
  config: AuditLogPayloadConfig;
  added: Array<{email: string; role: string}>;
  removed: Array<{email: string; role: string}>;
}

export interface ProjectCreatedAuditLogPayload extends BaseAuditLogPayload<'project_created'> {
  project: {
    id: string;
    name: string;
    description: string;
    createdAt: Date;
  };
}

export interface ProjectUpdatedAuditLogPayload extends BaseAuditLogPayload<'project_updated'> {
  before: {
    id: string;
    name: string;
    description: string;
    requireProposals: boolean;
    allowSelfApprovals: boolean;
    createdAt: Date;
    updatedAt: Date;
  };
  after: {
    id: string;
    name: string;
    description: string;
    requireProposals: boolean;
    allowSelfApprovals: boolean;
    createdAt: Date;
    updatedAt: Date;
  };
}

export interface ProjectMembersChangedAuditLogPayload
  extends BaseAuditLogPayload<'project_members_changed'> {
  added: Array<{email: string; role: string}>;
  removed: Array<{email: string; role: string}>;
}

export interface ProjectDeletedAuditLogPayload extends BaseAuditLogPayload<'project_deleted'> {
  project: {
    id: string;
    name: string;
    description: string;
    createdAt: Date;
    updatedAt: Date;
  };
}

export interface EnvironmentCreatedAuditLogPayload
  extends BaseAuditLogPayload<'environment_created'> {
  environment: {
    id: string;
    name: string;
    projectId: string;
    createdAt: Date;
  };
}

export interface EnvironmentDeletedAuditLogPayload
  extends BaseAuditLogPayload<'environment_deleted'> {
  environment: {
    id: string;
    name: string;
    projectId: string;
  };
}

export interface ConfigProposalCreatedAuditLogPayload
  extends BaseAuditLogPayload<'config_proposal_created'> {
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

export interface ConfigProposalRejectedAuditLogPayload
  extends BaseAuditLogPayload<'config_proposal_rejected'> {
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

export interface ConfigProposalApprovedAuditLogPayload
  extends BaseAuditLogPayload<'config_proposal_approved'> {
  proposalId: string;
  configId: string;
  proposedDelete?: boolean;
  proposedValue?: {newValue: unknown};
  proposedDescription?: string;
  proposedSchema?: {newSchema: unknown};
  proposedOverrides?: {newOverrides: unknown};
  proposedMembers?: {newMembers: Array<{email: string; role: string}>};
}

export interface ConfigVariantProposalCreatedAuditLogPayload
  extends BaseAuditLogPayload<'config_variant_proposal_created'> {
  proposalId: string;
  configVariantId: string;
  configId: string;
  proposedValue?: {newValue: unknown};
  proposedSchema?: {newSchema: unknown};
  proposedOverrides?: {newOverrides: unknown};
  message?: string;
}

export interface ConfigVariantProposalRejectedAuditLogPayload
  extends BaseAuditLogPayload<'config_variant_proposal_rejected'> {
  proposalId: string;
  configVariantId: string;
  configId: string;
  rejectedInFavorOfProposalId?: string;
  proposedValue?: {newValue: unknown};
  proposedSchema?: {newSchema: unknown};
  proposedOverrides?: {newOverrides: unknown};
}

export interface ConfigVariantProposalApprovedAuditLogPayload
  extends BaseAuditLogPayload<'config_variant_proposal_approved'> {
  proposalId: string;
  configVariantId: string;
  configId: string;
  proposedValue?: {newValue: unknown};
  proposedSchema?: {newSchema: unknown};
  proposedOverrides?: {newOverrides: unknown};
}

export interface WorkspaceCreatedAuditLogPayload
  extends BaseAuditLogPayload<'workspace_created'> {
  workspace: {
    id: string;
    name: string;
  };
}

export interface WorkspaceUpdatedAuditLogPayload
  extends BaseAuditLogPayload<'workspace_updated'> {
  workspace: {
    id: string;
    name: string;
  };
  before: {
    name: string;
  };
  after: {
    name: string;
  };
}

export interface WorkspaceDeletedAuditLogPayload
  extends BaseAuditLogPayload<'workspace_deleted'> {
  workspace: {
    id: string;
    name: string;
  };
}

export interface WorkspaceMemberAddedAuditLogPayload
  extends BaseAuditLogPayload<'workspace_member_added'> {
  workspace: {
    id: string;
    name: string;
  };
  member: {
    email: string;
    role: string;
  };
}

export interface WorkspaceMemberRemovedAuditLogPayload
  extends BaseAuditLogPayload<'workspace_member_removed'> {
  workspace: {
    id: string;
    name: string;
  };
  member: {
    email: string;
    role: string;
  };
}

export interface WorkspaceMemberRoleChangedAuditLogPayload
  extends BaseAuditLogPayload<'workspace_member_role_changed'> {
  workspace: {
    id: string;
    name: string;
  };
  member: {
    email: string;
  };
  before: {
    role: string;
  };
  after: {
    role: string;
  };
}

export type AuditLogPayload =
  | ConfigCreatedAuditLogPayload
  | ConfigUpdatedAuditLogPayload
  | ConfigDeletedAuditLogPayload
  | ConfigVersionRestoredAuditLogPayload
  | ConfigVariantUpdatedAuditLogPayload
  | ConfigVariantVersionRestoredAuditLogPayload
  | ApiKeyCreatedAuditLogPayload
  | ApiKeyDeletedAuditLogPayload
  | ConfigMembersChangedAuditLogPayload
  | ProjectCreatedAuditLogPayload
  | ProjectUpdatedAuditLogPayload
  | ProjectMembersChangedAuditLogPayload
  | ProjectDeletedAuditLogPayload
  | EnvironmentCreatedAuditLogPayload
  | EnvironmentDeletedAuditLogPayload
  | ConfigProposalCreatedAuditLogPayload
  | ConfigProposalRejectedAuditLogPayload
  | ConfigProposalApprovedAuditLogPayload
  | ConfigVariantProposalCreatedAuditLogPayload
  | ConfigVariantProposalRejectedAuditLogPayload
  | ConfigVariantProposalApprovedAuditLogPayload
  | WorkspaceCreatedAuditLogPayload
  | WorkspaceUpdatedAuditLogPayload
  | WorkspaceDeletedAuditLogPayload
  | WorkspaceMemberAddedAuditLogPayload
  | WorkspaceMemberRemovedAuditLogPayload
  | WorkspaceMemberRoleChangedAuditLogPayload;

export interface AuditLog {
  id: AuditLogId;
  userId: number | null;
  configId: ConfigId | null;
  payload: AuditLogPayload;
  createdAt: Date;
  projectId: string | null;
}

export class AuditLogStore {
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
      id: AuditLogId;
    };
  }): Promise<AuditLog[]> {
    let query = this.db
      .selectFrom('audit_logs')
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
      .then(x => x.map(toAuditLog));
  }

  async create(log: AuditLog) {
    await this.db
      .insertInto('audit_logs')
      .values([
        {
          id: log.id,
          created_at: log.createdAt,
          config_id: log.configId,
          payload: serializeJson(log.payload),
          user_id: log.userId,
          project_id: log.projectId,
        },
      ])
      .execute();
  }

  async getById(id: AuditLogId): Promise<AuditLog | undefined> {
    const row = await this.db
      .selectFrom('audit_logs')
      .selectAll()
      .where('id', '=', id)
      .executeTakeFirst();
    return row ? toAuditLog(row) : undefined;
  }
}

function toAuditLog(log: Selectable<AuditLogs>): AuditLog {
  return {
    configId: log.config_id,
    createdAt: log.created_at,
    id: log.id,
    payload: deserializeJson(log.payload) as AuditLogPayload,
    userId: log.user_id,
    projectId: log.project_id,
  };
}
