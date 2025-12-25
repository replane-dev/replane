import {LRUCache} from 'lru-cache';
import type {SdkKeyInfo} from '../engine';
import type {ReplicaService} from './replica';
import {extractSdkKeyId} from './sdk-key-utils';
import type {SecureHashingService} from './secure-hashing-service';
import type {Service} from './service';

export class SdkKeyService implements Service {
  private sdkKeyCache = new LRUCache<string, Promise<SdkKeyInfo | null>>({
    max: 500,
    // ttl: 60_000, // 1 minute
    ttl: 1,
  });

  readonly name = 'ApiTokenService';

  constructor(
    private readonly replicaService: ReplicaService,
    private readonly hasher: SecureHashingService,
  ) {}
  async start(): Promise<void> {}

  async stop(): Promise<void> {}

  async verifySdkKey(key: string): Promise<SdkKeyInfo | null> {
    const cached = this.sdkKeyCache.get(key);
    if (cached) return await cached;

    const result = (async (): Promise<SdkKeyInfo | null> => {
      const keyId = extractSdkKeyId(key);
      if (!keyId) return null;

      console.log('keyId', keyId);

      const sdkKey = await this.replicaService.getSdkKeyById(keyId);
      if (!sdkKey) return null;

      console.log('sdkKey', sdkKey);

      const valid = await this.hasher.verify(sdkKey.keyHash, key);
      if (!valid) return null;

      return {projectId: sdkKey.projectId, environmentId: sdkKey.environmentId};
    })();

    this.sdkKeyCache.set(key, result);
    return await result;
  }
}
