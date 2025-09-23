import {AsyncWorker} from '@/engine/core/async-worker';
import {describe, expect, it, vi} from 'vitest';

const tick = () => new Promise(r => setTimeout(r, 0));

describe('AsyncWorker', () => {
  it("doesn't throws if started twice", () => {
    const worker = new AsyncWorker({
      name: 'twice',
      task: async () => {},
      onError: () => {},
    });
    worker.start();
    expect(() => worker.start()).not.toThrow();
  });

  it('throws if wakeup is called before start', () => {
    const worker = new AsyncWorker({
      name: 'before-start',
      task: async () => {},
      onError: () => {},
    });
    expect(() => worker.wakeup()).toThrow(/not started/);
  });

  it('runs task exactly once on single wakeup', async () => {
    let runs = 0;
    const worker = new AsyncWorker({
      name: 'single',
      task: async () => {
        runs += 1;
      },
      onError: () => {},
    });

    worker.start();

    // Allow the macrotask queue to flush and the async task to resolve
    await tick();

    expect(runs).toBe(1);
  });

  it('coalesces multiple wakeups while running into a single additional run', async () => {
    let runs = 0;
    const releases: Array<() => void> = [];

    const worker = new AsyncWorker({
      name: 'coalesce',
      task: async () => {
        runs += 1;
        return new Promise<void>(resolve => {
          releases.push(resolve);
        });
      },
      onError: () => {},
    });

    worker.start();

    expect(runs).toBe(1);
    expect(releases.length).toBe(1);

    // Multiple wakeups while running should only schedule one extra run
    worker.wakeup();
    worker.wakeup();
    worker.wakeup();

    // Finish first run -> should trigger exactly one more run
    releases.shift()?.();
    await tick();

    expect(runs).toBe(2);
    // There should be a pending second run now
    expect(releases.length).toBe(1);

    // Finish second run -> should NOT schedule any further runs
    releases.shift()?.();
    await tick();

    expect(runs).toBe(2);
    expect(releases.length).toBe(0);
  });

  it('invokes onError when task throws and continues to work afterwards', async () => {
    const onError = vi.fn();
    const err = new Error('boom');

    const worker = new AsyncWorker({
      name: 'errors',
      task: async () => {
        throw err;
      },
      onError,
    });

    await worker.start();

    expect(onError).toHaveBeenCalledTimes(1);
    expect(onError).toHaveBeenCalledWith(err);

    // A second wakeup should attempt to run again and error again
    worker.wakeup();
    await tick();

    expect(onError).toHaveBeenCalledTimes(2);
  });
});
