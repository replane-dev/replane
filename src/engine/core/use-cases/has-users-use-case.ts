import type {TransactionalUseCase} from '../use-case';

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
