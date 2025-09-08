import {describe, expect, it} from 'vitest';
import {joinUndefined} from '../src/engine/core/utils';

/**
 * joinUndefined(...parts: (string | undefined)[]): string | undefined
 *  - Returns concatenated string when all parts are defined (including empty strings)
 *  - Returns undefined if any part is undefined
 *  - Edge case: with zero arguments returns an empty string (Array#join behaviour)
 */

describe('joinUndefined', () => {
  it('concatenates all defined parts', () => {
    expect(joinUndefined('a', 'b', 'c')).toBe('abc');
  });

  it('returns undefined if any part is undefined (middle)', () => {
    expect(joinUndefined('a', undefined, 'b')).toBeUndefined();
  });

  it('returns undefined if any part is undefined (start)', () => {
    expect(joinUndefined(undefined, 'x', 'y')).toBeUndefined();
  });

  it('returns undefined if any part is undefined (end)', () => {
    expect(joinUndefined('x', 'y', undefined)).toBeUndefined();
  });

  it('handles empty string parts', () => {
    expect(joinUndefined('a', '', 'b')).toBe('ab');
  });

  it('returns the single part unchanged when only one defined part', () => {
    expect(joinUndefined('solo')).toBe('solo');
  });

  it('returns empty string when called with no arguments (documenting current behavior)', () => {
    expect(joinUndefined()).toBe('');
  });
});
