import assert from 'assert';

export interface MemberLike {
  email: string;
  role: string;
}

export function diffMembers<T extends MemberLike>(existing: T[], next: T[]) {
  // email can contain only one @, so we use it twice for a separator
  const SEPARATOR = '@@';

  assert(existing.every(x => !x.email.includes(SEPARATOR) && !x.role.includes(SEPARATOR)));
  assert(next.every(x => !x.email.includes(SEPARATOR) && !x.role.includes(SEPARATOR)));

  const toMemberId = (member: MemberLike) => `${member.role}${SEPARATOR}${member.email}`;

  const existingIds = new Set(existing.map(toMemberId));
  const nextIds = new Set(next.map(toMemberId));

  const added = next.filter(u => !existingIds.has(toMemberId(u)));
  const removed = existing.filter(u => !nextIds.has(toMemberId(u)));

  return {added, removed};
}
