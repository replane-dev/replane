export interface UseCase<TRequest extends {}, TResponse extends {}> {
  (request: TRequest): Promise<TResponse>;
}
