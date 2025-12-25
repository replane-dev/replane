import {LRUCache} from 'lru-cache';
import type {SdkKeyInfo} from '../../engine';
import type {ReplicaService} from '../replica';
import {extractSdkKeyId} from '../sdk-key-utils';
import type {SecureHashingService} from '../secure-hashing-service';
import type {UseCase} from '../use-case';

export interface VerifySdkKeyRequest {
  key: string;
}

export type VerifySdkKeyResponse = SdkKeyInfo | null;

export interface VerifySdkKeyUseCaseDeps {
  replicaService: ReplicaService;
  hasher: SecureHashingService;
}

export function createVerifySdkKeyUseCase(
  deps: VerifySdkKeyUseCaseDeps,
): UseCase<VerifySdkKeyRequest, VerifySdkKeyResponse> {
  const sdkKeyCache = new LRUCache<string, Promise<SdkKeyInfo | null>>({
    max: 500,
    ttl: 60_000, // 1 minute
  });

  return async (_ctx, req) => {
    const {key} = req;

    const cached = sdkKeyCache.get(key);
    if (cached) return await cached;

    const result = (async (): Promise<SdkKeyInfo | null> => {
      const keyId = extractSdkKeyId(key);
      if (!keyId) return null;

      const sdkKey = await deps.replicaService.getSdkKeyById(keyId);
      if (!sdkKey) return null;

      const valid = await deps.hasher.verify(sdkKey.keyHash, key);
      if (!valid) return null;

      return {projectId: sdkKey.projectId, environmentId: sdkKey.environmentId};
    })();

    sdkKeyCache.set(key, result);
    return await result;
  };
}
