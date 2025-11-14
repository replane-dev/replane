import type {ConfigUserRole, ProjectUserRole} from './db';
import {assertNever} from './utils';

export function combineConfigAndProjectRoles(
  myProjectUserRole: ProjectUserRole,
  _myConfigUserRole: ConfigUserRole | 'viewer',
): ConfigUserRole {
  if (myProjectUserRole === 'owner') {
    return 'owner';
  } else if (myProjectUserRole === 'admin') {
    return 'owner';
  } else {
    assertNever(myProjectUserRole, 'Unknown project user role');
  }
}
