import {UseCase} from '../use-case';

export interface GetHealthRequest {}

export interface GetHealthResponse {}

export function createGetHealthUseCase(): UseCase<GetHealthRequest, GetHealthResponse> {
  return async () => {
    return {};
  };
}
