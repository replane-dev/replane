import type {UseCase} from '../use-case';

export interface GetConfigValueRequest {
  name: string;
}

export interface GetConfigValueResponse {
  value: unknown | undefined; // undefined when config not found
}

export function createGetConfigValueUseCase(): UseCase<
  GetConfigValueRequest,
  GetConfigValueResponse
> {
  return async (_ctx, tx, req) => {
    const config = await tx.configs.getByName(req.name);
    if (!config) return {value: undefined};
    // (Optional future: enforce permissions)
    return {value: config.value};
  };
}
