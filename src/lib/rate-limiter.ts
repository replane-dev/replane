import {AUTH_MAX_REQUESTS_PER_WINDOW, AUTH_MAX_REQUESTS_WINDOW_MS} from '@/engine/core/constants';
import {LRUCache} from 'lru-cache';

interface RateLimitEntry {
  count: number;
  resetAt: number;
}

interface RateLimiterOptions {
  /** Maximum number of requests allowed within the window */
  maxRequests: number;
  /** Time window in milliseconds */
  windowMs: number;
}

interface RateLimitResult {
  success: boolean;
  remaining: number;
  resetAt: number;
}

/**
 * Simple in-memory rate limiter using LRU cache.
 */
export class RateLimiter {
  private cache: LRUCache<string, RateLimitEntry>;
  private maxRequests: number;
  private windowMs: number;

  constructor(options: RateLimiterOptions) {
    this.maxRequests = options.maxRequests;
    this.windowMs = options.windowMs;
    this.cache = new LRUCache<string, RateLimitEntry>({
      max: 10000, // Maximum number of keys to track
      ttl: options.windowMs,
    });
  }

  /**
   * Check and consume a rate limit token for the given key.
   *
   * @param key - The identifier to rate limit (e.g., IP address, email)
   * @returns Result indicating if the request is allowed
   */
  limit(key: string): RateLimitResult {
    const now = Date.now();
    const entry = this.cache.get(key);

    if (!entry || now >= entry.resetAt) {
      // First request or window expired
      const resetAt = now + this.windowMs;
      this.cache.set(key, {count: 1, resetAt});
      return {
        success: true,
        remaining: this.maxRequests - 1,
        resetAt,
      };
    }

    if (entry.count >= this.maxRequests) {
      // Rate limit exceeded
      return {
        success: false,
        remaining: 0,
        resetAt: entry.resetAt,
      };
    }

    // Increment counter
    entry.count++;
    this.cache.set(key, entry);

    return {
      success: true,
      remaining: this.maxRequests - entry.count,
      resetAt: entry.resetAt,
    };
  }

  /**
   * Reset the rate limit for a given key.
   * Useful after successful authentication.
   */
  reset(key: string): void {
    this.cache.delete(key);
  }
}

// Singleton rate limiters for auth endpoints
export const authRateLimiter = new RateLimiter({
  maxRequests: AUTH_MAX_REQUESTS_PER_WINDOW,
  windowMs: AUTH_MAX_REQUESTS_WINDOW_MS,
});
