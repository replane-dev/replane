import {describe, expect, it} from 'vitest';
import {chunkArray, getDaysAgo, mapConcurrently, trimEnd, unique, wait} from './utils';

describe('chunkArray', () => {
  it('should chunk an array of numbers into smaller arrays of the specified size', () => {
    const array = [1, 2, 3, 4, 5, 6, 7, 8, 9];
    const chunkSize = 3;
    const expectedChunks = [
      [1, 2, 3],
      [4, 5, 6],
      [7, 8, 9],
    ];

    const result = chunkArray(array, chunkSize);

    expect(result).toEqual(expectedChunks);
  });

  it('should handle array lengths not perfectly divisible by chunk size', () => {
    const array = [1, 2, 3, 4, 5, 6, 7, 8];
    const chunkSize = 3;
    const expectedChunks = [
      [1, 2, 3],
      [4, 5, 6],
      [7, 8],
    ];

    const result = chunkArray(array, chunkSize);

    expect(result).toEqual(expectedChunks);
  });

  it('should return a single chunk if chunk size is larger than array length', () => {
    const array = [1, 2, 3];
    const chunkSize = 5;
    const expectedChunks = [[1, 2, 3]];

    const result = chunkArray(array, chunkSize);

    expect(result).toEqual(expectedChunks);
  });

  it('should return an empty array if the input array is empty', () => {
    const array: number[] = [];
    const chunkSize = 3;
    const expectedChunks: number[][] = [];

    const result = chunkArray(array, chunkSize);

    expect(result).toEqual(expectedChunks);
  });

  it('should return an array of single-element arrays if chunk size is 1', () => {
    const array = [1, 2, 3, 4];
    const chunkSize = 1;
    const expectedChunks = [[1], [2], [3], [4]];

    const result = chunkArray(array, chunkSize);

    expect(result).toEqual(expectedChunks);
  });

  it('should work with arrays of different data types', () => {
    const array = ['a', 'b', 'c', 'd', 'e'];
    const chunkSize = 2;
    const expectedChunks = [['a', 'b'], ['c', 'd'], ['e']];

    const result = chunkArray(array, chunkSize);

    expect(result).toEqual(expectedChunks);
  });

  it('should throw an error if chunk size is 0', () => {
    const array = [1, 2, 3];
    const chunkSize = 0;

    expect(() => chunkArray(array, chunkSize)).toThrow('Chunk size must be greater than 0');
  });

  it('should throw an error if chunk size is negative', () => {
    const array = [1, 2, 3];
    const chunkSize = -2;

    expect(() => chunkArray(array, chunkSize)).toThrow('Chunk size must be greater than 0');
  });

  it('should return a single chunk if array length is equal to chunk size', () => {
    const array = [1, 2, 3];
    const chunkSize = 3;
    const expectedChunks = [[1, 2, 3]];

    const result = chunkArray(array, chunkSize);

    expect(result).toEqual(expectedChunks);
  });

  it('should handle large arrays', () => {
    const largeArray = Array.from({length: 1000}, (_, i) => i + 1);
    const chunkSize = 100;
    const expectedNumberOfChunks = 10;

    const result = chunkArray(largeArray, chunkSize);

    expect(result).toHaveLength(expectedNumberOfChunks);
    expect(result[0]).toHaveLength(chunkSize);
    expect(result[result.length - 1]).toHaveLength(chunkSize);
    expect(result[0][0]).toBe(1);
    expect(result[expectedNumberOfChunks - 1][chunkSize - 1]).toBe(1000);
  });
});

describe('unique', () => {
  it('should return an array with unique elements', () => {
    const array = [1, 2, 2, 3, 4, 4, 5];
    const expectedUnique = [1, 2, 3, 4, 5];

    const result = unique(array);

    expect(result).toEqual(expectedUnique);
  });

  it('should return an empty array when input is empty', () => {
    const array: number[] = [];
    const expectedUnique: number[] = [];

    const result = unique(array);

    expect(result).toEqual(expectedUnique);
  });

  it('should handle arrays with all unique elements', () => {
    const array = [1, 2, 3, 4, 5];
    const expectedUnique = [1, 2, 3, 4, 5];

    const result = unique(array);

    expect(result).toEqual(expectedUnique);
  });
});

describe('trimEnd', () => {
  it('should remove a single trailing character', () => {
    const result = trimEnd('hello,', ',');

    expect(result).toBe('hello');
  });

  it('should remove multiple trailing characters', () => {
    const result = trimEnd('test!!!', '!');

    expect(result).toBe('test');
  });

  it('should not change the string if the character is not at the end', () => {
    const result = trimEnd('hello, world', ',');

    expect(result).toBe('hello, world');
  });

  it('should return the original string if it does not end with the character', () => {
    const result = trimEnd('abc', 'd');

    expect(result).toBe('abc');
  });

  it('should return an empty string if the input string is empty', () => {
    const result = trimEnd('', 'a');

    expect(result).toBe('');
  });

  it('should return an empty string if the string consists only of the characters to be trimmed', () => {
    const result = trimEnd('////', '/');

    expect(result).toBe('');
  });

  it('should handle a multi-character string for trimming', () => {
    const result = trimEnd('start-end-end', '-end');

    expect(result).toBe('start');
  });

  it('should handle overlapping patterns correctly', () => {
    const result = trimEnd('ababab', 'ab');

    expect(result).toBe('');
  });

  it('should handle non-overlapping but repeated patterns', () => {
    const result = trimEnd('test-abc-abc', '-abc');

    expect(result).toBe('test');
  });

  it('should not enter an infinite loop or change the string if the trim character is an empty string', () => {
    expect(() => trimEnd('hello', '')).toThrow();
  });

  it('should correctly trim trailing whitespace', () => {
    const result = trimEnd('some value  ', ' ');

    expect(result).toBe('some value');
  });

  it('should handle special characters and symbols', () => {
    const result = trimEnd('data$$$', '$$');

    expect(result).toBe('data$');
  });

  it('should handle a mix of characters where only the end is trimmed', () => {
    const result = trimEnd('path/to/file/', '/');

    expect(result).toBe('path/to/file');
  });
});

describe('getDaysAgo', () => {
  it('should return the date exactly 5 days ago', () => {
    const today = new Date('2023-10-10T00:00:00Z');
    const expectedDate = new Date('2023-10-05T00:00:00Z');

    const result = getDaysAgo(today, 5);

    expect(result.toISOString()).toBe(expectedDate.toISOString());
  });

  it('should return the date exactly 1 day ago', () => {
    const today = new Date('2023-10-10T00:00:00Z');
    const expectedDate = new Date('2023-10-09T00:00:00Z');

    const result = getDaysAgo(today, 1);

    expect(result.toISOString()).toBe(expectedDate.toISOString());
  });

  it('should handle a case where the input date is in the past', () => {
    const today = new Date('2023-10-10T00:00:00Z');
    const expectedDate = new Date('2022-10-13T00:00:00Z');

    const result = getDaysAgo(today, 362);

    expect(result.toISOString()).toBe(expectedDate.toISOString());
  });
});

describe('mapConcurrently', () => {
  it('should preserve result order even with varying delays', async () => {
    const items = [1, 2, 3, 4, 5];
    const delays = [30, 10, 25, 5, 15];

    const result = await mapConcurrently<number, number>({
      items,
      concurrencyLimit: 2,
      map: async x => {
        await wait(delays[x - 1]);
        return x * 10;
      },
    });

    expect(result).toEqual([10, 20, 30, 40, 50]);
  });

  it('should not exceed the specified concurrency limit', async () => {
    const items = Array.from({length: 12}, (_, i) => i + 1);
    const concurrencyLimit = 3;
    let running = 0;
    let maxRunning = 0;

    await mapConcurrently<number, number>({
      items,
      concurrencyLimit,
      map: async x => {
        running++;
        if (running > maxRunning) maxRunning = running;
        // simulate work
        await wait(20);
        running--;
        return x;
      },
    });

    expect(maxRunning).toBeLessThanOrEqual(concurrencyLimit);
  });

  it('should work serially when concurrencyLimit = 1', async () => {
    const items = [1, 2, 3, 4];
    let running = 0;
    let maxRunning = 0;

    const result = await mapConcurrently<number, number>({
      items,
      concurrencyLimit: 1,
      map: async x => {
        running++;
        if (running > maxRunning) maxRunning = running;
        await wait(5);
        running--;
        return x * 2;
      },
    });

    expect(maxRunning).toBe(1);
    expect(result).toEqual([2, 4, 6, 8]);
  });

  it('should allow full parallelism when concurrencyLimit >= items.length', async () => {
    const items = [1, 2, 3, 4];
    const concurrencyLimit = 10;
    let running = 0;
    let maxRunning = 0;

    const result = await mapConcurrently<number, number>({
      items,
      concurrencyLimit,
      map: async x => {
        running++;
        if (running > maxRunning) maxRunning = running;
        await wait(15);
        running--;
        return x * x;
      },
    });

    expect(maxRunning).toBe(items.length);
    expect(result).toEqual([1, 4, 9, 16]);
  });

  it('should throw on first error (fail fast) and avoid starting many more tasks', async () => {
    const items = Array.from({length: 20}, (_, i) => i);
    const concurrencyLimit = 4;
    let started = 0;

    await expect(
      mapConcurrently<number, number>({
        items,
        concurrencyLimit,
        map: async x => {
          started++;
          // cause an early failure
          if (x === 2) {
            await wait(5);
            throw new Error('boom');
          }
          await wait(20);
          return x;
        },
      }),
    ).rejects.toThrow('boom');

    // We can’t guarantee an exact number, but we expect we didn’t kick off *all* 20.
    expect(started).toBeLessThan(items.length);
  });

  it('should return an empty array for empty input', async () => {
    const items: number[] = [];

    const result = await mapConcurrently<number, number>({
      items,
      concurrencyLimit: 3,
      map: async x => x,
    });

    expect(result).toEqual([]);
  });

  it('should throw if concurrencyLimit <= 0', async () => {
    const items = [1, 2, 3];

    await expect(
      mapConcurrently<number, number>({
        items,
        concurrencyLimit: 0,
        map: async x => x,
      }),
    ).rejects.toThrow(/greater than 0/i);

    await expect(
      mapConcurrently<number, number>({
        items,
        concurrencyLimit: -2,
        map: async x => x,
      }),
    ).rejects.toThrow(/greater than 0/i);
  });
});
