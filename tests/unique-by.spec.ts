import {describe, expect, it} from 'vitest';
import {uniqueBy} from '../src/engine/core/utils';

/**
 * uniqueBy<T, K>(array: T[], toKey: (item: T) => K): T[]
 *  - Returns array with duplicates removed based on key function
 *  - Keeps the first occurrence of each unique key
 *  - Preserves original order
 */

describe('uniqueBy', () => {
  it('removes duplicates based on key function', () => {
    const input = [
      {id: 1, name: 'a'},
      {id: 2, name: 'b'},
      {id: 1, name: 'c'},
    ];
    const result = uniqueBy(input, x => x.id);
    expect(result).toEqual([
      {id: 1, name: 'a'},
      {id: 2, name: 'b'},
    ]);
  });

  it('keeps the first occurrence of each unique key', () => {
    const input = [
      {id: 1, value: 'first'},
      {id: 1, value: 'second'},
      {id: 1, value: 'third'},
    ];
    const result = uniqueBy(input, x => x.id);
    expect(result).toEqual([{id: 1, value: 'first'}]);
  });

  it('preserves order of first occurrences', () => {
    const input = [
      {type: 'b', order: 1},
      {type: 'a', order: 2},
      {type: 'c', order: 3},
      {type: 'b', order: 4},
      {type: 'a', order: 5},
    ];
    const result = uniqueBy(input, x => x.type);
    expect(result).toEqual([
      {type: 'b', order: 1},
      {type: 'a', order: 2},
      {type: 'c', order: 3},
    ]);
  });

  it('returns empty array for empty input', () => {
    const result = uniqueBy([], x => x);
    expect(result).toEqual([]);
  });

  it('returns same items when all keys are unique', () => {
    const input = [
      {id: 1, name: 'a'},
      {id: 2, name: 'b'},
      {id: 3, name: 'c'},
    ];
    const result = uniqueBy(input, x => x.id);
    expect(result).toEqual(input);
  });

  it('works with primitive arrays', () => {
    const input = [1, 2, 3, 2, 1, 4];
    const result = uniqueBy(input, x => x);
    expect(result).toEqual([1, 2, 3, 4]);
  });

  it('works with string keys', () => {
    const input = [
      {name: 'Alice', age: 30},
      {name: 'Bob', age: 25},
      {name: 'Alice', age: 35},
    ];
    const result = uniqueBy(input, x => x.name);
    expect(result).toEqual([
      {name: 'Alice', age: 30},
      {name: 'Bob', age: 25},
    ]);
  });

  it('handles null and undefined keys correctly', () => {
    const input = [
      {id: null, value: 'a'},
      {id: undefined, value: 'b'},
      {id: null, value: 'c'},
      {id: undefined, value: 'd'},
      {id: 1, value: 'e'},
    ];
    const result = uniqueBy(input, x => x.id);
    expect(result).toEqual([
      {id: null, value: 'a'},
      {id: undefined, value: 'b'},
      {id: 1, value: 'e'},
    ]);
  });

  it('works with computed keys', () => {
    const input = [
      {first: 'John', last: 'Doe'},
      {first: 'Jane', last: 'Doe'},
      {first: 'John', last: 'Smith'},
      {first: 'John', last: 'Doe'},
    ];
    const result = uniqueBy(input, x => `${x.first}-${x.last}`);
    expect(result).toEqual([
      {first: 'John', last: 'Doe'},
      {first: 'Jane', last: 'Doe'},
      {first: 'John', last: 'Smith'},
    ]);
  });

  it('does not mutate the original array', () => {
    const input = [
      {id: 1, name: 'a'},
      {id: 1, name: 'b'},
    ];
    const original = [...input];
    uniqueBy(input, x => x.id);
    expect(input).toEqual(original);
  });
});

