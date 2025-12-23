import type {ConfigUserRole, ProjectUserRole} from './db';
import {assertNever} from './utils';

type Role = ConfigUserRole | 'viewer' | ProjectUserRole;

function rolePriority(role: Role): number {
  if (role === 'admin') {
    return 3;
  } else if (role === 'maintainer') {
    return 2;
  } else if (role === 'editor') {
    return 1;
  } else if (role === 'viewer') {
    return 0;
  } else {
    assertNever(role, `Unknown config user role: ${role}`);
  }
}

export function getHighestRole(roles: Role[]): Role {
  return roles.reduce((highest, role) => {
    return rolePriority(role) > rolePriority(highest) ? role : highest;
  }, 'viewer');
}
