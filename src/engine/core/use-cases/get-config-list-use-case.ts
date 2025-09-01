import z from 'zod';
import type {UseCase} from '../use-case';

export function ConfigInfo() {
  return z.object({
    name: z.string(),
    createdAt: z.date(),
    updatedAt: z.date(),
  });
}

export interface ConfigInfo extends z.infer<ReturnType<typeof ConfigInfo>> {}

export interface GetConfigListRequest {}

export interface GetConfigListResponse {
  configs: ConfigInfo[];
}

export interface GetConfigListUseCasesDeps {}

export function createGetConfigListUseCase(
  deps: GetConfigListUseCasesDeps,
): UseCase<GetConfigListRequest, GetConfigListResponse> {
  return async (ctx, tx) => {
    const configs = await tx.configStore.getAll();
    return {configs: configs.map(c => ({name: c.name, createdAt: c.createdAt, updatedAt: c.updatedAt}))};
  };
}
