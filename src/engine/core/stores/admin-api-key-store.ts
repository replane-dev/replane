import type {Kysely} from 'kysely';
import type {AdminApiKeyScope, DB} from '../db';
import type {NormalizedEmail} from '../zod';

export interface AdminApiKey {
  id: string;
  workspaceId: string;
  name: string;
  description: string;
  keyPrefix: string;
  createdByEmail: string;
  createdAt: Date;
  updatedAt: Date;
  lastUsedAt: Date | null;
  expiresAt: Date | null;
  scopes: AdminApiKeyScope[];
  projectIds: string[] | null;
}

export interface AdminApiKeyWithHash extends AdminApiKey {
  keyHash: string;
}

export class AdminApiKeyStore {
  constructor(private readonly db: Kysely<DB>) {}

  /**
   * Create a new admin API key with its scopes and optional project restrictions.
   */
  async create(params: {
    id: string;
    workspaceId: string;
    name: string;
    description: string;
    keyHash: string;
    keyPrefix: string;
    createdByEmail: NormalizedEmail;
    createdAt: Date;
    expiresAt: Date | null;
    scopes: AdminApiKeyScope[];
    projectIds: string[] | null;
  }): Promise<void> {
    // Insert the main key record
    await this.db
      .insertInto('admin_api_keys')
      .values({
        id: params.id,
        workspace_id: params.workspaceId,
        name: params.name,
        description: params.description,
        key_hash: params.keyHash,
        key_prefix: params.keyPrefix,
        created_by_email: params.createdByEmail,
        created_at: params.createdAt,
        updated_at: params.createdAt,
        expires_at: params.expiresAt,
      })
      .execute();

    // Insert scopes
    if (params.scopes.length > 0) {
      await this.db
        .insertInto('admin_api_key_scopes')
        .values(
          params.scopes.map(scope => ({
            admin_api_key_id: params.id,
            scope,
          })),
        )
        .execute();
    }

    // Insert project restrictions (if any)
    if (params.projectIds !== null && params.projectIds.length > 0) {
      await this.db
        .insertInto('admin_api_key_projects')
        .values(
          params.projectIds.map(projectId => ({
            admin_api_key_id: params.id,
            project_id: projectId,
          })),
        )
        .execute();
    }
  }

  /**
   * List all admin API keys for a workspace.
   */
  async listByWorkspace(workspaceId: string): Promise<AdminApiKey[]> {
    const keys = await this.db
      .selectFrom('admin_api_keys')
      .selectAll()
      .where('workspace_id', '=', workspaceId)
      .orderBy('created_at', 'desc')
      .execute();

    // Fetch scopes and projects for all keys
    const keyIds = keys.map(k => k.id);
    if (keyIds.length === 0) {
      return [];
    }

    const [scopes, projects] = await Promise.all([
      this.db
        .selectFrom('admin_api_key_scopes')
        .selectAll()
        .where('admin_api_key_id', 'in', keyIds)
        .execute(),
      this.db
        .selectFrom('admin_api_key_projects')
        .selectAll()
        .where('admin_api_key_id', 'in', keyIds)
        .execute(),
    ]);

    // Group scopes and projects by key ID
    const scopesByKeyId = new Map<string, AdminApiKeyScope[]>();
    for (const scope of scopes) {
      const list = scopesByKeyId.get(scope.admin_api_key_id) ?? [];
      list.push(scope.scope);
      scopesByKeyId.set(scope.admin_api_key_id, list);
    }

    const projectsByKeyId = new Map<string, string[]>();
    for (const project of projects) {
      const list = projectsByKeyId.get(project.admin_api_key_id) ?? [];
      list.push(project.project_id);
      projectsByKeyId.set(project.admin_api_key_id, list);
    }

    return keys.map(k => ({
      id: k.id,
      workspaceId: k.workspace_id,
      name: k.name,
      description: k.description,
      keyPrefix: k.key_prefix,
      createdByEmail: k.created_by_email,
      createdAt: k.created_at,
      updatedAt: k.updated_at,
      lastUsedAt: k.last_used_at,
      expiresAt: k.expires_at,
      scopes: scopesByKeyId.get(k.id) ?? [],
      // null means all projects, empty array means no projects
      projectIds: projectsByKeyId.has(k.id) ? (projectsByKeyId.get(k.id) ?? []) : null,
    }));
  }

  /**
   * Get an admin API key by ID.
   */
  async getById(id: string): Promise<AdminApiKey | null> {
    const key = await this.db
      .selectFrom('admin_api_keys')
      .selectAll()
      .where('id', '=', id)
      .executeTakeFirst();

    if (!key) {
      return null;
    }

    const [scopes, projects] = await Promise.all([
      this.db
        .selectFrom('admin_api_key_scopes')
        .select('scope')
        .where('admin_api_key_id', '=', id)
        .execute(),
      this.db
        .selectFrom('admin_api_key_projects')
        .select('project_id')
        .where('admin_api_key_id', '=', id)
        .execute(),
    ]);

    return {
      id: key.id,
      workspaceId: key.workspace_id,
      name: key.name,
      description: key.description,
      keyPrefix: key.key_prefix,
      createdByEmail: key.created_by_email,
      createdAt: key.created_at,
      updatedAt: key.updated_at,
      lastUsedAt: key.last_used_at,
      expiresAt: key.expires_at,
      scopes: scopes.map(s => s.scope),
      projectIds: projects.length > 0 ? projects.map(p => p.project_id) : null,
    };
  }

  /**
   * Get an admin API key by its hash (for authentication).
   * Also returns the hash for verification.
   */
  async getByKeyHash(keyHash: string): Promise<AdminApiKeyWithHash | null> {
    const key = await this.db
      .selectFrom('admin_api_keys')
      .selectAll()
      .where('key_hash', '=', keyHash)
      .executeTakeFirst();

    if (!key) {
      return null;
    }

    const [scopes, projects] = await Promise.all([
      this.db
        .selectFrom('admin_api_key_scopes')
        .select('scope')
        .where('admin_api_key_id', '=', key.id)
        .execute(),
      this.db
        .selectFrom('admin_api_key_projects')
        .select('project_id')
        .where('admin_api_key_id', '=', key.id)
        .execute(),
    ]);

    return {
      id: key.id,
      workspaceId: key.workspace_id,
      name: key.name,
      description: key.description,
      keyHash: key.key_hash,
      keyPrefix: key.key_prefix,
      createdByEmail: key.created_by_email,
      createdAt: key.created_at,
      updatedAt: key.updated_at,
      lastUsedAt: key.last_used_at,
      expiresAt: key.expires_at,
      scopes: scopes.map(s => s.scope),
      projectIds: projects.length > 0 ? projects.map(p => p.project_id) : null,
    };
  }

  /**
   * Update the last used timestamp for a key.
   */
  async updateLastUsedAt(id: string, lastUsedAt: Date): Promise<void> {
    await this.db
      .updateTable('admin_api_keys')
      .set({last_used_at: lastUsedAt})
      .where('id', '=', id)
      .execute();
  }

  /**
   * Delete an admin API key by ID.
   * Cascades to scopes and project restrictions.
   */
  async deleteById(id: string): Promise<void> {
    await this.db.deleteFrom('admin_api_keys').where('id', '=', id).execute();
  }

  /**
   * Check if a key exists and belongs to the specified workspace.
   */
  async existsInWorkspace(id: string, workspaceId: string): Promise<boolean> {
    const result = await this.db
      .selectFrom('admin_api_keys')
      .select('id')
      .where('id', '=', id)
      .where('workspace_id', '=', workspaceId)
      .executeTakeFirst();

    return result !== undefined;
  }
}

