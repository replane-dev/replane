import type {Kysely} from 'kysely';
import {LRUCache} from 'lru-cache';
import type {ApiKeyInfo} from '../engine';
import {extractApiTokenId} from './api-token-utils';
import type {DB} from './db';
import type {Service} from './service';
import type {TokenHashingService} from './token-hashing-service';

export class ApiTokenService implements Service {
  private apiKeyCache = new LRUCache<string, ApiKeyInfo>({
    max: 500,
    ttl: 60_000, // 1 minute
  });

  readonly name = 'ApiTokenService';

  constructor(
    private readonly db: Kysely<DB>,
    private readonly tokenHasher: TokenHashingService,
  ) {}
  async start(): Promise<void> {}

  async stop(): Promise<void> {}

  async verifyApiKey(token: string): Promise<ApiKeyInfo | null> {
    const cached = this.apiKeyCache.get(token);
    if (cached) return cached;

    const tokenId = extractApiTokenId(token);
    if (!tokenId) return null;

    const row = await this.db
      .selectFrom('api_tokens as t')
      .select(['t.id as id', 't.token_hash as token_hash', 't.project_id'])
      .where('t.id', '=', tokenId)
      .executeTakeFirst();
    if (!row) return null;

    const valid = await this.tokenHasher.verify(row.token_hash, token);
    if (!valid) return null;

    const info: ApiKeyInfo = {projectId: row.project_id};
    this.apiKeyCache.set(token, info);
    return info;
  }
}
