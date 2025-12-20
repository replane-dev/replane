import type {TransactionalUseCase} from '../use-case';

export interface UserExistsRequest {
  email: string;
}

export interface UserExistsResponse {
  exists: boolean;
}

/**
 * Checks if a user with the given email exists.
 * Used by auth-options to check if registration is allowed when DISABLE_REGISTRATION is set.
 */
export function createUserExistsUseCase(): TransactionalUseCase<
  UserExistsRequest,
  UserExistsResponse
> {
  return async (ctx, tx, req) => {
    const user = await tx.users.getByEmail(req.email.toLowerCase());
    return {
      exists: user !== null,
    };
  };
}

