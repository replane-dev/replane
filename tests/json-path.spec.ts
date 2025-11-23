import {describe, expect, it} from 'vitest';
import {formatJsonPath, getValueByPath, parseJsonPath} from '../src/engine/core/json-path';

describe('JSON Path', () => {
  describe('parseJsonPath', () => {
    it('should parse simple property path', () => {
      expect(parseJsonPath('foo')).toEqual(['foo']);
      expect(parseJsonPath('foo.bar')).toEqual(['foo', 'bar']);
      expect(parseJsonPath('foo.bar.baz')).toEqual(['foo', 'bar', 'baz']);
    });

    it('should parse array index path', () => {
      expect(parseJsonPath('[0]')).toEqual([0]);
      expect(parseJsonPath('foo[0]')).toEqual(['foo', 0]);
      expect(parseJsonPath('foo[0][1]')).toEqual(['foo', 0, 1]);
    });

    it('should parse mixed paths', () => {
      expect(parseJsonPath('foo[0].bar')).toEqual(['foo', 0, 'bar']);
      expect(parseJsonPath('foo.bar[1].baz')).toEqual(['foo', 'bar', 1, 'baz']);
      expect(parseJsonPath('a[0].b[1].c')).toEqual(['a', 0, 'b', 1, 'c']);
    });

    it('should handle empty string', () => {
      expect(parseJsonPath('')).toEqual([]);
    });

    it('should handle special characters in brackets', () => {
      expect(parseJsonPath('[special-key]')).toEqual(['special-key']);
      expect(parseJsonPath('[key_with_underscore]')).toEqual(['key_with_underscore']);
    });
  });

  describe('formatJsonPath', () => {
    it('should format simple property path', () => {
      expect(formatJsonPath(['foo'])).toBe('foo');
      expect(formatJsonPath(['foo', 'bar'])).toBe('foo.bar');
      expect(formatJsonPath(['foo', 'bar', 'baz'])).toBe('foo.bar.baz');
    });

    it('should format array index path', () => {
      expect(formatJsonPath([0])).toBe('[0]');
      expect(formatJsonPath(['foo', 0])).toBe('foo[0]');
      expect(formatJsonPath(['foo', 0, 1])).toBe('foo[0][1]');
    });

    it('should format mixed paths', () => {
      expect(formatJsonPath(['foo', 0, 'bar'])).toBe('foo[0].bar');
      expect(formatJsonPath(['foo', 'bar', 1, 'baz'])).toBe('foo.bar[1].baz');
    });

    it('should handle empty array', () => {
      expect(formatJsonPath([])).toBe('');
    });

    it('should quote keys with special characters', () => {
      expect(formatJsonPath(['special-key'])).toBe('special-key');
      expect(formatJsonPath(['foo', 'special-key'])).toBe('foo["special-key"]');
      expect(formatJsonPath(['foo', 'key with spaces'])).toBe('foo["key with spaces"]');
    });

    it('should not quote valid identifiers', () => {
      expect(formatJsonPath(['foo', '_bar'])).toBe('foo._bar');
      expect(formatJsonPath(['foo', '$baz'])).toBe('foo.$baz');
      expect(formatJsonPath(['foo', 'bar123'])).toBe('foo.bar123');
    });
  });

  describe('getValueByPath', () => {
    it('should get value from simple property path', () => {
      const obj = {foo: 'bar'};
      expect(getValueByPath(obj, ['foo'])).toBe('bar');
    });

    it('should get value from nested property path', () => {
      const obj = {foo: {bar: {baz: 'value'}}};
      expect(getValueByPath(obj, ['foo', 'bar', 'baz'])).toBe('value');
    });

    it('should get value from array index', () => {
      const obj = {items: ['a', 'b', 'c']};
      expect(getValueByPath(obj, ['items', 1])).toBe('b');
    });

    it('should get value from mixed paths', () => {
      const obj = {
        users: [
          {name: 'Alice', age: 30},
          {name: 'Bob', age: 25},
        ],
      };
      expect(getValueByPath(obj, ['users', 0, 'name'])).toBe('Alice');
      expect(getValueByPath(obj, ['users', 1, 'age'])).toBe(25);
    });

    it('should return undefined for missing properties', () => {
      const obj = {foo: 'bar'};
      expect(getValueByPath(obj, ['missing'])).toBeUndefined();
      expect(getValueByPath(obj, ['foo', 'bar'])).toBeUndefined();
    });

    it('should return undefined for null/undefined intermediate values', () => {
      const obj = {foo: null};
      expect(getValueByPath(obj, ['foo', 'bar'])).toBeUndefined();
    });

    it('should return the object itself for empty path', () => {
      const obj = {foo: 'bar'};
      expect(getValueByPath(obj, [])).toEqual({foo: 'bar'});
    });

    it('should handle arrays as root', () => {
      const arr = ['a', 'b', 'c'];
      expect(getValueByPath(arr, [0])).toBe('a');
      expect(getValueByPath(arr, [2])).toBe('c');
    });

    it('should handle nested arrays', () => {
      const obj = {matrix: [[1, 2], [3, 4]]};
      expect(getValueByPath(obj, ['matrix', 0, 1])).toBe(2);
      expect(getValueByPath(obj, ['matrix', 1, 0])).toBe(3);
    });

    it('should return undefined for out of bounds array access', () => {
      const obj = {items: ['a', 'b']};
      expect(getValueByPath(obj, ['items', 5])).toBeUndefined();
    });

    it('should handle boolean and number primitives correctly', () => {
      const obj = {active: true, count: 42};
      expect(getValueByPath(obj, ['active'])).toBe(true);
      expect(getValueByPath(obj, ['count'])).toBe(42);
    });
  });

  describe('parseJsonPath and formatJsonPath round-trip', () => {
    it('should round-trip simple paths', () => {
      const paths = ['foo.bar', 'a.b.c', 'x[0]', 'y[0].z', 'a.b[1].c[2].d'];
      
      for (const path of paths) {
        const parsed = parseJsonPath(path);
        const formatted = formatJsonPath(parsed);
        const reparsed = parseJsonPath(formatted);
        expect(reparsed).toEqual(parsed);
      }
    });
  });
});

