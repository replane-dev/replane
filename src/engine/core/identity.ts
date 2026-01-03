import {ForbiddenError} from './errors';
import type {NormalizedEmail} from './zod';

/**
 * Admin API key permission scopes.
 * These control what operations an API key can perform.
 */
export type AdminApiKeyScope =
  | 'project:read'
  | 'project:write'
  | 'config:read'
  | 'config:write'
  | 'environment:read'
  | 'environment:write'
  | 'sdk_key:read'
  | 'sdk_key:write'
  | 'member:read'
  | 'member:write';

/**
 * All available admin API key scopes.
 */
export const ADMIN_API_KEY_SCOPES: readonly AdminApiKeyScope[] = [
  'project:read',
  'project:write',
  'config:read',
  'config:write',
  'environment:read',
  'environment:write',
  'sdk_key:read',
  'sdk_key:write',
  'member:read',
  'member:write',
] as const;

/**
 * Identity representing a user making a request.
 */
export interface UserIdentity {
  type: 'user';
  identityName: string;
  user: {
    email: NormalizedEmail;
    id: number;
    name: string | null;
  };
}

/**
 * Identity representing an API key making a request.
 */
export interface ApiKeyIdentity {
  type: 'api_key';
  identityName: string;
  apiKeyId: string;
  workspaceId: string;
  /** Project IDs this key has access to. Null means all projects in the workspace. */
  projectIds: string[] | null;
  /** Scopes/permissions this key has. */
  scopes: AdminApiKeyScope[];
}

/**
 * Identity representing a superuser with full access to all operations.
 * This bypasses all permission checks.
 */
export interface SuperuserIdentity {
  type: 'superuser';
  identityName: string;
}

/**
 * Discriminated union representing who is making a request.
 * Can be a user (authenticated via session), an API key, or a superuser.
 */
export type Identity = UserIdentity | ApiKeyIdentity | SuperuserIdentity;

/**
 * Helper to check if an identity is a user.
 */
export function isUserIdentity(identity: Identity): identity is UserIdentity {
  return identity.type === 'user';
}

/**
 * Helper to check if an identity is an API key.
 */
export function isApiKeyIdentity(identity: Identity): identity is ApiKeyIdentity {
  return identity.type === 'api_key';
}

/**
 * Helper to check if an identity is a superuser.
 */
export function isSuperuserIdentity(identity: Identity): identity is SuperuserIdentity {
  return identity.type === 'superuser';
}

/**
 * Create a user identity from an email.
 */
export function createUserIdentity(user: {
  email: NormalizedEmail;
  id: number;
  name: string | null;
}): UserIdentity {
  return {type: 'user', identityName: user.name ?? user.email, user};
}

/**
 * Create an API key identity.
 */
export function createApiKeyIdentity(params: {
  apiKeyId: string;
  workspaceId: string;
  projectIds: string[] | null;
  scopes: AdminApiKeyScope[];
}): ApiKeyIdentity {
  return {
    type: 'api_key',
    identityName: `API key ${params.apiKeyId}`,
    apiKeyId: params.apiKeyId,
    workspaceId: params.workspaceId,
    projectIds: params.projectIds,
    scopes: params.scopes,
  };
}

/**
 * Create a superuser identity.
 */
export function createSuperuserIdentity(): SuperuserIdentity {
  return {
    type: 'superuser',
    identityName: 'Superuser',
  };
}

/**
 * Check if an API key identity has a specific scope.
 */
export function hasScope(identity: ApiKeyIdentity, scope: AdminApiKeyScope): boolean {
  return identity.scopes.includes(scope);
}

/**
 * Check if an API key identity has access to a specific project.
 */
export function hasProjectAccess(params: {
  identity: ApiKeyIdentity;
  project: {id: string; workspaceId: string};
}): boolean {
  // Null means access to all projects in the workspace
  if (params.identity.projectIds === null) {
    return params.project.workspaceId === params.identity.workspaceId;
  }
  return (
    params.identity.projectIds.includes(params.project.id) &&
    params.project.workspaceId === params.identity.workspaceId
  );
}

/**
 * Get the email from an identity (only available for user identities).
 */
export function getEmailFromIdentity2(identity: Identity): NormalizedEmail | null {
  if (isUserIdentity(identity)) {
    return identity.user.email;
  }
  return null;
}

/**
 * Get the user ID from an identity (only available for user identities).
 */
export function getUserIdFromIdentity(identity: Identity): number | null {
  if (isUserIdentity(identity)) {
    return identity.user.id;
  }
  return null;
}

/**
 * Require a user identity and return the email.
 * Throws ForbiddenError if the identity is not a user.
 */
export function requireUserEmail(identity: Identity): NormalizedEmail {
  if (!isUserIdentity(identity)) {
    throw new ForbiddenError('This operation requires a user identity, not an API key');
  }
  return identity.user.email;
}
