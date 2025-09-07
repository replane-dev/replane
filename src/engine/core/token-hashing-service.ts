import crypto from 'node:crypto';

export interface TokenHashingService {
  hash(token: string): Promise<string>;
  verify(hash: string, token: string): Promise<boolean>;
}

// Simple SHA-256 hashing service (unsalted, deterministic).
// NOTE: This is weaker than Argon2 (no memory hardness). Consider reintroducing
// a stronger KDF if tokens need resistance against offline brute-force.
export function createSha256TokenHashingService(): TokenHashingService {
  function sha256(data: string): string {
    return crypto.createHash('sha256').update(data, 'utf8').digest('hex');
  }
  return {
    async hash(token: string) {
      return sha256(token);
    },
    async verify(hash: string, token: string) {
      return sha256(token) === hash;
    },
  };
}
