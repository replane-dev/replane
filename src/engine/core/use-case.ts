import {ConfigStore} from './config-store';
import type {ConfigUserStore} from './config-user-store';
import type {Context} from './context';
import type {UserStore} from './user-store';

export interface UseCase<TRequest, TResponse> {
  (ctx: Context, tx: UseCaseTransaction, request: TRequest): Promise<TResponse>;
}

export interface UseCaseTransaction {
  configs: ConfigStore;
  users: UserStore;
  configUsers: ConfigUserStore;
}
