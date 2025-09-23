import type {TransactionalUseCase} from '../use-case';

export interface GetHealthRequest {}

export interface GetHealthResponse {}

export function createGetHealthUseCase(): TransactionalUseCase<
  GetHealthRequest,
  GetHealthResponse
> {
  return async () => {
    return {};
  };
}
