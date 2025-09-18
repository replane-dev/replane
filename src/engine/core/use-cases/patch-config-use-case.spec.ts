import {describe, expect, it} from 'vitest';
import {diffMembers} from '../member-diff';

type Role = 'owner' | 'editor' | 'viewer';
const member = (email: string, role: Role) => ({email, role});

describe('diffConfigMembers', () => {
  it('returns empty added and removed when members are the same', () => {
    const existing = [member('a@example.com', 'owner')];
    const next = [member('a@example.com', 'owner')];
    expect(diffMembers(existing, next)).toEqual({added: [], removed: []});
  });

  it('detects added members', () => {
    const existing = [member('a@example.com', 'owner')];
    const next = [member('a@example.com', 'owner'), member('b@example.com', 'editor')];
    expect(diffMembers(existing, next)).toEqual({
      added: [member('b@example.com', 'editor')],
      removed: [],
    });
  });

  it('detects removed members', () => {
    const existing = [member('a@example.com', 'owner'), member('b@example.com', 'editor')];
    const next = [member('a@example.com', 'owner')];
    expect(diffMembers(existing, next)).toEqual({
      added: [],
      removed: [member('b@example.com', 'editor')],
    });
  });

  it('detects both added and removed members', () => {
    const existing = [member('a@example.com', 'owner')];
    const next = [member('b@example.com', 'editor')];
    expect(diffMembers(existing, next)).toEqual({
      added: [member('b@example.com', 'editor')],
      removed: [member('a@example.com', 'owner')],
    });
  });

  it('detects role changes as remove+add', () => {
    const existing = [member('a@example.com', 'owner')];
    const next = [member('a@example.com', 'editor')];
    expect(diffMembers(existing, next)).toEqual({
      added: [member('a@example.com', 'editor')],
      removed: [member('a@example.com', 'owner')],
    });
  });

  it('handles empty lists', () => {
    expect(diffMembers([], [])).toEqual({added: [], removed: []});
    expect(diffMembers([], [member('a@example.com', 'owner')])).toEqual({
      added: [member('a@example.com', 'owner')],
      removed: [],
    });
    expect(diffMembers([member('a@example.com', 'owner')], [])).toEqual({
      added: [],
      removed: [member('a@example.com', 'owner')],
    });
  });
});
