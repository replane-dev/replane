// Use Web Crypto API (available in modern browsers and Node.js >= 18)

export interface HashingService {
  hash(source: string): Promise<string>;
  verify(hash: string, source: string): Promise<boolean>;
}

// Simple SHA-256 hashing service (unsalted, deterministic).
// NOTE: This is weaker than Argon2 (no memory hardness). Consider reintroducing
// a stronger KDF if tokens need resistance against offline brute-force.
export function createSha256HashingService(): HashingService {
  function toHex(buffer: ArrayBuffer): string {
    const bytes = new Uint8Array(buffer);
    let hex = '';
    for (let i = 0; i < bytes.length; i++) {
      const h = bytes[i].toString(16).padStart(2, '0');
      hex += h;
    }
    return hex;
  }

  async function sha256(data: string): Promise<string> {
    const encoder = new TextEncoder();
    const digest = await crypto.subtle.digest('SHA-256', encoder.encode(data));
    return toHex(digest);
  }
  return {
    async hash(token: string) {
      return sha256(token);
    },
    async verify(hash: string, token: string) {
      return (await sha256(token)) === hash;
    },
  };
}
