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
 * Discriminated union representing who is making a request.
 * Can be either a user (authenticated via session) or an API key.
 */
export type Identity = UserIdentity | ApiKeyIdentity;

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
 * Check if an API key identity has a specific scope.
 */
export function hasScope(identity: ApiKeyIdentity, scope: AdminApiKeyScope): boolean {
  return identity.scopes.includes(scope);
}

/**
 * Check if an API key identity has access to a specific project.
 */
export function hasProjectAccess(identity: ApiKeyIdentity, projectId: string): boolean {
  // Null means access to all projects in the workspace
  if (identity.projectIds === null) {
    return true;
  }
  return identity.projectIds.includes(projectId);
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
