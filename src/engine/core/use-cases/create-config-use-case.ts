import z from 'zod';
import {ConfigName, ConfigValue} from '../config-store';
import type {DateProvider} from '../date-provider';
import {BadRequestError} from '../errors';
import type {UseCase} from '../use-case';

export function CreateConfigRequest() {
  return z.object({
    name: ConfigName(),
    value: ConfigValue(),
  });
}

export interface CreateConfigRequest extends z.infer<ReturnType<typeof CreateConfigRequest>> {}

export interface CreateConfigResponse {}

export interface CreateConfigUseCaseDeps {
  dateProvider: DateProvider;
}

export function createCreateConfigUseCase(
  deps: CreateConfigUseCaseDeps,
): UseCase<CreateConfigRequest, CreateConfigResponse> {
  return async (ctx, tx, req) => {
    const existingConfig = await tx.configStore.get(req.name);
    if (existingConfig) {
      throw new BadRequestError('Config with this name already exists');
    }

    await tx.configStore.put({
      name: req.name,
      value: req.value,
      createdAt: deps.dateProvider.now(),
      updatedAt: deps.dateProvider.now(),
    });

    return {};
  };
}
