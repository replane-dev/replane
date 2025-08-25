import {ConfigStore} from './config-store';
import {Context} from './context';

export interface UseCase<TRequest, TResponse> {
  (ctx: Context, tx: UseCaseTransaction, request: TRequest): Promise<TResponse>;
}

export interface UseCaseTransaction {
  configStore: ConfigStore;
}
