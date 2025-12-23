import type {Kysely} from 'kysely';
import {LRUCache} from 'lru-cache';
import {extractAdminApiKeyId, hashAdminApiKey} from '../admin-api-key-utils';
import type {AdminApiKeyScope, DB} from '../db';
import {createApiKeyIdentity, type ApiKeyIdentity} from '../identity';
import type {UseCase} from '../use-case';

export interface VerifyAdminApiKeyRequest {
  key: string;
}

export interface VerifyAdminApiKeyResult {
  identity: ApiKeyIdentity;
}

export type VerifyAdminApiKeyResponse =
  | {status: 'valid'; identity: ApiKeyIdentity}
  | {status: 'invalid'; reason: 'invalid_format' | 'invalid_key' | 'expired'};

export interface VerifyAdminApiKeyUseCaseDeps {
  db: Kysely<DB>;
}

export function createVerifyAdminApiKeyUseCase(
  deps: VerifyAdminApiKeyUseCaseDeps,
): UseCase<VerifyAdminApiKeyRequest, VerifyAdminApiKeyResponse> {
  const {db} = deps;

  // Cache verified keys for performance (1 minute TTL)
  const keyCache = new LRUCache<string, Promise<VerifyAdminApiKeyResponse>>({
    max: 500,
    ttl: 60_000,
  });

  return async (_ctx, req) => {
    const {key} = req;

    const cached = keyCache.get(key);
    if (cached) return await cached;

    const result = (async (): Promise<VerifyAdminApiKeyResponse> => {
      // Extract the key ID from the raw key
      const keyId = extractAdminApiKeyId(key);
      if (!keyId) {
        return {status: 'invalid', reason: 'invalid_format'};
      }

      // Hash the key for verification
      const keyHash = await hashAdminApiKey(key);

      // Fetch the key by hash
      const adminKey = await db
        .selectFrom('admin_api_keys')
        .selectAll()
        .where('id', '=', keyId)
        .executeTakeFirst();

      if (!adminKey) {
        return {status: 'invalid', reason: 'invalid_key'};
      }

      if (adminKey.key_hash !== keyHash) {
        return {status: 'invalid', reason: 'invalid_key'};
      }

      // Check if key is expired
      if (adminKey.expires_at && new Date(adminKey.expires_at) < new Date()) {
        return {status: 'invalid', reason: 'expired'};
      }

      // Fetch scopes
      const scopes = await db
        .selectFrom('admin_api_key_scopes')
        .select('scope')
        .where('admin_api_key_id', '=', adminKey.id)
        .execute();

      // Fetch project restrictions
      const projects = await db
        .selectFrom('admin_api_key_projects')
        .select('project_id')
        .where('admin_api_key_id', '=', adminKey.id)
        .execute();

      // Update last used timestamp (fire and forget)
      db.updateTable('admin_api_keys')
        .set({last_used_at: new Date()})
        .where('id', '=', adminKey.id)
        .execute()
        .catch(() => {});

      // Create identity
      const identity = createApiKeyIdentity({
        apiKeyId: adminKey.id,
        workspaceId: adminKey.workspace_id,
        projectIds: projects.length > 0 ? projects.map(p => p.project_id) : null,
        scopes: scopes.map(s => s.scope) as AdminApiKeyScope[],
      });

      return {status: 'valid', identity};
    })();

    keyCache.set(key, result);
    return await result;
  };
}
