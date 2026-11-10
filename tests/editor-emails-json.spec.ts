import {describe, expect, it} from 'vitest';
import {editorsToJson, parseEditorsJson} from '../src/lib/editor-emails-json';

describe('editorsToJson', () => {
  it('pretty-prints emails as a JSON array', () => {
    expect(editorsToJson(['a@example.com', 'b@example.com'])).toBe(
      '[\n  "a@example.com",\n  "b@example.com"\n]',
    );
  });

  it('omits blank rows', () => {
    expect(editorsToJson(['a@example.com', '', '   '])).toBe('[\n  "a@example.com"\n]');
  });

  it('returns an empty array for no editors', () => {
    expect(editorsToJson([])).toBe('[]');
  });
});

describe('parseEditorsJson', () => {
  it('parses an array of strings', () => {
    expect(parseEditorsJson('["a@example.com", "b@example.com"]')).toEqual([
      'a@example.com',
      'b@example.com',
    ]);
  });

  it('parses an empty array', () => {
    expect(parseEditorsJson('[]')).toEqual([]);
  });

  it('keeps invalid emails so form validation can report them', () => {
    expect(parseEditorsJson('["not-an-email"]')).toEqual(['not-an-email']);
  });

  it('returns null for malformed JSON', () => {
    expect(parseEditorsJson('["a@example.com",')).toBeNull();
  });

  it('returns null for non-array JSON', () => {
    expect(parseEditorsJson('{"email": "a@example.com"}')).toBeNull();
    expect(parseEditorsJson('"a@example.com"')).toBeNull();
  });

  it('returns null when an item is not a string', () => {
    expect(parseEditorsJson('["a@example.com", 42]')).toBeNull();
  });
});
