import {requireUserEmail, type Identity} from '../identity';
import type {TransactionalUseCase} from '../use-case';

export interface GetUserProfileRequest {
  identity: Identity;
}

export interface GetUserProfileResponse {
  id: number;
  email: string | null;
  name: string | null;
  image: string | null;
}

export function createGetUserProfileUseCase(): TransactionalUseCase<
  GetUserProfileRequest,
  GetUserProfileResponse | null
> {
  return async (_ctx, tx, req) => {
    // This operation requires a user identity
    const currentUserEmail = requireUserEmail(req.identity);

    const user = await tx.users.getByEmail(currentUserEmail);

    if (!user) {
      return null;
    }

    return {
      id: user.id,
      email: user.email,
      name: user.name,
      image: user.image,
    };
  };
}
