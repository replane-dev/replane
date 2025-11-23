import type {ConfigUserRole, ProjectUserRole} from './db';
import {assertNever} from './utils';

export function combineConfigAndProjectRoles(
  myProjectUserRole: ProjectUserRole,
  _myConfigUserRole: ConfigUserRole | 'viewer',
): ConfigUserRole {
  // Project admin and maintainer both get full config maintainer access
  if (myProjectUserRole === 'admin') {
    return 'maintainer';
  } else if (myProjectUserRole === 'maintainer') {
    return 'maintainer';
  } else {
    assertNever(myProjectUserRole, 'Unknown project user role');
  }
}
