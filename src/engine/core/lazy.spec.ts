import {describe, expect, it, vi} from 'vitest';
import {Lazy} from './lazy.js';

const delay = (ms: number) => new Promise<void>(resolve => setTimeout(resolve, ms));

describe('Lazy', () => {
  it('should initialize once and cache the value for subsequent calls', async () => {
    const init = vi.fn().mockResolvedValue(42);
    const lazy = new Lazy(init);

    const v1 = await lazy.get();
    const v2 = await lazy.get();

    expect(v1).toBe(42);
    expect(v2).toBe(42);
    expect(init).toHaveBeenCalledTimes(1);
  });

  it('should only run the initializer once for concurrent calls and return the same value to all', async () => {
    const init = vi.fn().mockImplementation(async () => {
      await delay(20);
      return {n: 7};
    });
    const lazy = new Lazy(init);

    const [r1, r2, r3, r4, r5] = await Promise.all([lazy.get(), lazy.get(), lazy.get(), lazy.get(), lazy.get()]);

    expect(init).toHaveBeenCalledTimes(1);
    // All should be strictly equal (same object reference)
    expect(r1).toBe(r2);
    expect(r2).toBe(r3);
    expect(r3).toBe(r4);
    expect(r4).toBe(r5);
  });

  it('should not cache when initializer throws and should retry on next call', async () => {
    const init = vi.fn<() => Promise<string>>();
    let attempt = 0;
    init.mockImplementation(async () => {
      attempt += 1;
      if (attempt === 1) {
        await delay(5);
        throw new Error('boom');
      }
      return 'ok';
    });

    const lazy = new Lazy(init);

    await expect(lazy.get()).rejects.toThrow('boom');
    await expect(lazy.get()).resolves.toBe('ok');
    expect(init).toHaveBeenCalledTimes(2);
  });

  it('should return cached value immediately after initialization completes', async () => {
    const init = vi.fn().mockImplementation(async () => {
      await delay(10);
      return 123;
    });
    const lazy = new Lazy(init);

    const first = await lazy.get();
    const start = Date.now();
    const second = await lazy.get();
    const elapsed = Date.now() - start;

    expect(first).toBe(123);
    expect(second).toBe(123);
    expect(init).toHaveBeenCalledTimes(1);
    // Should be effectively synchronous (no extra delay)
    expect(elapsed).toBeLessThan(5);
  });
});
