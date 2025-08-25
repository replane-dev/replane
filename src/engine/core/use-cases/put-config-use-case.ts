import {Config} from '../config-store';
import {UseCase} from '../use-case';

export interface PutConfigRequest {
  config: Config;
}

export interface PutConfigResponse {}

export interface PutConfigUseCaseDeps {}

export function createPutConfigUseCase(deps: PutConfigUseCaseDeps): UseCase<PutConfigRequest, PutConfigResponse> {
  return async (ctx, tx, req) => {
    await tx.configStore.put(req.config);

    return {};
  };
}
