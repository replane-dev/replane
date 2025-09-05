import {describe, expect, it} from 'vitest';
import {diffConfigMembers} from './patch-config-use-case';

describe('diffConfigUsers', () => {
  it('returns added users that are present in new but not in existing', () => {
    const existing = [{email: 'alice@example.com', role: 'editor' as const}];
    const updated = [
      {email: 'alice@example.com', role: 'editor' as const},
      {email: 'bob@example.com', role: 'owner' as const},
    ];

    const {added, removed} = diffConfigMembers(existing, updated);

    expect(added).toEqual([{email: 'bob@example.com', role: 'owner'}]);
    expect(removed).toEqual([]);
  });

  it('returns removed users that are absent in new', () => {
    const existing = [
      {email: 'alice@example.com', role: 'editor' as const},
      {email: 'bob@example.com', role: 'owner' as const},
    ];
    const updated = [{email: 'alice@example.com', role: 'editor' as const}];

    const {added, removed} = diffConfigMembers(existing, updated);

    expect(added).toEqual([]);
    expect(removed).toEqual([{email: 'bob@example.com', role: 'owner'}]);
  });

  it('returns both added and removed when lists differ', () => {
    const existing = [
      {email: 'alice@example.com', role: 'editor' as const},
      {email: 'bob@example.com', role: 'owner' as const},
    ];
    const updated = [
      {email: 'bob@example.com', role: 'owner' as const},
      {email: 'carol@example.com', role: 'editor' as const},
    ];

    const {added, removed} = diffConfigMembers(existing, updated);

    expect(added).toEqual([{email: 'carol@example.com', role: 'editor'}]);
    expect(removed).toEqual([{email: 'alice@example.com', role: 'editor'}]);
  });

  it('returns empty arrays when there is no change', () => {
    const existing = [
      {email: 'alice@example.com', role: 'editor' as const},
      {email: 'bob@example.com', role: 'owner' as const},
    ];
    const updated = [
      {email: 'alice@example.com', role: 'editor' as const},
      {email: 'bob@example.com', role: 'owner' as const},
    ];

    const {added, removed} = diffConfigMembers(existing, updated);

    expect(added).toEqual([]);
    expect(removed).toEqual([]);
  });

  it('does not treat role-only changes as added or removed (current behavior)', () => {
    const existing = [{email: 'alice@example.com', role: 'editor' as const}];
    const updated = [{email: 'alice@example.com', role: 'owner' as const}];

    const {added, removed} = diffConfigMembers(existing, updated);

    expect(added).toEqual([]);
    expect(removed).toEqual([]);
  });

  it('keeps duplicates in new users (current behavior)', () => {
    const existing: Array<{email: string; role: 'editor' | 'owner'}> = [];
    const updated = [
      {email: 'dup@example.com', role: 'editor' as const},
      {email: 'dup@example.com', role: 'owner' as const},
    ];

    const {added, removed} = diffConfigMembers(existing, updated);

    expect(removed).toEqual([]);
    // Added includes both duplicates because existing set is empty
    expect(added).toEqual([
      {email: 'dup@example.com', role: 'editor'},
      {email: 'dup@example.com', role: 'owner'},
    ]);
  });
});
