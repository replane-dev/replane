import {assert, describe, expect, it, vi} from 'vitest';
import {Deferred} from './deferred.js';

describe('Deferred', () => {
  it('should initialize with a pending state', () => {
    const deferred = new Deferred();
    expect(deferred.state).toBe('pending');
  });

  it('should resolve with the given value', async () => {
    const deferred = new Deferred();
    const value = 'testValue';

    deferred.resolve(value);

    expect(deferred.state).toBe('fulfilled');
    await expect(deferred.promise).resolves.toBe(value);
  });

  it('should reject with the given error', async () => {
    const deferred = new Deferred();
    const error = new Error('testError');

    deferred.reject(error);

    expect(deferred.state).toBe('rejected');
    await expect(deferred.promise).rejects.toThrow();
  });

  it('should not resolve again after being fulfilled', async () => {
    const deferred = new Deferred();
    const firstValue = 'firstValue';
    const secondValue = 'secondValue';

    deferred.resolve(firstValue);
    deferred.resolve(secondValue);

    expect(deferred.state).toBe('fulfilled');
    await expect(deferred.promise).resolves.toBe(firstValue);
  });

  it('should not reject again after being rejected', async () => {
    const deferred = new Deferred();
    const firstError = new Error('firstError');
    const secondError = new Error('secondError');

    deferred.reject(firstError);
    const result1 = await deferred.promise.catch(err => err);
    deferred.reject(secondError);
    const result2 = await deferred.promise.catch(err => err);

    expect(deferred.state).toBe('rejected');
    expect(result1).toBe(result2);
  });

  it('should not resolve after being rejected', async () => {
    const deferred = new Deferred();
    const error = new Error('testError');
    const value = 'testValue';

    deferred.reject(error);
    deferred.resolve(value);

    expect(deferred.state).toBe('rejected');
    await expect(deferred.promise).rejects.toThrow();
  });

  it('should not reject after being fulfilled', async () => {
    const deferred = new Deferred();
    const value = 'testValue';
    const error = new Error('testError');

    deferred.resolve(value);
    deferred.reject(error);

    expect(deferred.state).toBe('fulfilled');
    await expect(deferred.promise).resolves.toBe(value);
  });

  it('should execute resolve callback when fulfilled', async () => {
    const deferred = new Deferred();
    const value = 'testValue';
    const onResolved = vi.fn();

    deferred.promise.then(onResolved).catch(() => {});
    deferred.resolve(value);

    await deferred.promise;

    expect(onResolved).toHaveBeenCalledWith(value);
  });

  it('should execute reject callback when rejected', async () => {
    const deferred = new Deferred();
    const error = new Error('testError');
    const onRejected = vi.fn();

    deferred.promise.catch(onRejected);
    deferred.reject(error);

    try {
      await deferred.promise;
    } catch {
      // swallow
    }

    expect(onRejected.mock.calls[0][0]).toBeInstanceOf(Error);
  });

  it('should maintain the fulfilled value after resolution', async () => {
    const deferred = new Deferred();
    const value = 'testValue';

    deferred.resolve(value);

    expect(deferred.state).toBe('fulfilled');
    assert(deferred['_state'].type === 'fulfilled');
    expect(deferred['_state'].value).toBe(value);
  });

  it('should maintain the rejection error after rejection', async () => {
    const deferred = new Deferred();
    const error = new Error('testError');

    deferred.reject(error);

    deferred.promise.catch(() => {});

    expect(deferred.state).toBe('rejected');
    assert(deferred['_state'].type === 'rejected');
    expect(deferred['_state'].reason).toBe(error);
  });
});
