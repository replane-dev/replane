import z from 'zod';
import {ConfigName, ConfigValue} from '../config-store';
import type {DateProvider} from '../date-provider';
import {BadRequestError} from '../errors';
import type {UseCase} from '../use-case';

export function UpdateConfigRequest() {
  return z.object({
    configName: ConfigName(),
    value: ConfigValue(),
  });
}

export interface UpdateConfigRequest extends z.infer<ReturnType<typeof UpdateConfigRequest>> {}

export interface UpdateConfigResponse {}

export interface UpdateConfigUseCaseDeps {
  dateProvider: DateProvider;
}

export function createUpdateConfigUseCase(
  deps: UpdateConfigUseCaseDeps,
): UseCase<UpdateConfigRequest, UpdateConfigResponse> {
  return async (ctx, tx, req) => {
    const existingConfig = await tx.configStore.get(req.configName);
    if (!existingConfig) {
      throw new BadRequestError('Config with this name does not exist');
    }

    await tx.configStore.put({
      ...existingConfig,
      value: req.value,
      updatedAt: deps.dateProvider.now(),
    });

    return {};
  };
}
