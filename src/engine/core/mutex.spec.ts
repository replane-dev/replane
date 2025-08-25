import {describe, expect, it, vi} from 'vitest';
import {Mutex} from './mutex.js';

describe('Mutex', () => {
  it('should acquire a lock when not locked', async () => {
    const mutex = new Mutex();
    await expect(mutex.lock()).resolves.toBeUndefined();
  });

  it('should release a lock', async () => {
    const mutex = new Mutex();
    await mutex.lock();
    expect(() => mutex.unlock()).not.toThrow();
  });

  it('should throw when unlocking a mutex that is not locked', () => {
    const mutex = new Mutex();
    expect(() => mutex.unlock()).toThrow(new Error('Mutex is not locked'));
  });

  it('should wait for lock to be released before acquiring', async () => {
    const mutex = new Mutex();
    await mutex.lock();

    const lockPromise = mutex.lock();
    // The promise should not resolve immediately
    const resolved = await Promise.race([lockPromise.then(() => true), Promise.resolve(false)]);
    expect(resolved).toBe(false);

    // After unlocking, the promise should resolve
    mutex.unlock();
    await expect(lockPromise).resolves.toBeUndefined();
  });

  it('should release locks in the correct order', async () => {
    const mutex = new Mutex();
    await mutex.lock();

    const order: number[] = [];
    const lock1 = mutex.lock().then(() => {
      order.push(1);
    });
    const lock2 = mutex.lock().then(() => {
      order.push(2);
    });
    const lock3 = mutex.lock().then(() => {
      order.push(3);
    });

    expect(order).toEqual([]);

    mutex.unlock();
    await lock1;
    expect(order).toEqual([1]);

    mutex.unlock();
    await lock2;
    expect(order).toEqual([1, 2]);

    mutex.unlock();
    await lock3;
    expect(order).toEqual([1, 2, 3]);
  });

  it('should run a function within a lock', async () => {
    const mutex = new Mutex();
    const result = await mutex.run(async () => 'result');
    expect(result).toBe('result');
  });

  it('should ensure the lock is released even if the function throws', async () => {
    const mutex = new Mutex();

    try {
      await mutex.run(async () => {
        throw new Error('Test error');
      });
    } catch (error) {
      // Expected to throw
    }

    await expect(mutex.lock()).resolves.toBeUndefined();
  });

  it('should ensure concurrent operations are executed sequentially', async () => {
    const mutex = new Mutex();
    const executionOrder: string[] = [];

    const mockFn1 = vi.fn().mockImplementation(async () => {
      executionOrder.push('start-1');
      await new Promise(resolve => setTimeout(resolve, 10));
      executionOrder.push('end-1');
      return 'result-1';
    });

    const mockFn2 = vi.fn().mockImplementation(async () => {
      executionOrder.push('start-2');
      await new Promise(resolve => setTimeout(resolve, 5));
      executionOrder.push('end-2');
      return 'result-2';
    });

    const [result1, result2] = await Promise.all([mutex.run(mockFn1), mutex.run(mockFn2)]);

    expect(result1).toBe('result-1');
    expect(result2).toBe('result-2');
    expect(mockFn1).toHaveBeenCalledTimes(1);
    expect(mockFn2).toHaveBeenCalledTimes(1);

    expect(executionOrder).toEqual(['start-1', 'end-1', 'start-2', 'end-2']);
  });

  it('should handle lock right after unlock', async () => {
    const ops: string[] = [];
    const mutex = new Mutex();
    const firstMutexPromise = mutex.lock().then(async () => {
      ops.push('lock-1-start');
      await new Promise(resolve => setTimeout(resolve, 0));
      ops.push('lock-1-end');
      mutex.unlock();
      // Start next lock immediately after unlocking
      await mutex.lock().then(async () => {
        ops.push('lock-2-start');
        await new Promise(resolve => setTimeout(resolve, 0));
        ops.push('lock-2-end');
        mutex.unlock();
      });
    });
    await mutex.lock().then(() => {
      ops.push('lock-3-start');
      mutex.unlock();
      ops.push('lock-3-end');
    });

    await firstMutexPromise;

    expect(ops).toEqual(['lock-1-start', 'lock-1-end', 'lock-3-start', 'lock-3-end', 'lock-2-start', 'lock-2-end']);
  });
});
