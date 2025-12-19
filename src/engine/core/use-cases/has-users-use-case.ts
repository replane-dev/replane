import type {TransactionalUseCase} from '../use-case';

// eslint-disable-next-line @typescript-eslint/no-empty-object-type
export interface HasUsersRequest {}

export interface HasUsersResponse {
  hasUsers: boolean;
}

export function createHasUsersUseCase(): TransactionalUseCase<HasUsersRequest, HasUsersResponse> {
  return async (ctx, tx, req) => {
    const users = await tx.db.selectFrom('users').select(['id']).limit(1).execute();
    return {
      hasUsers: users.length > 0,
    };
  };
}

