import type {TransactionalUseCase} from '../use-case';
import type {NormalizedEmail} from '../zod';

export interface GetUserProfileRequest {
  currentUserEmail: NormalizedEmail;
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
    const user = await tx.users.getByEmail(req.currentUserEmail);

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
