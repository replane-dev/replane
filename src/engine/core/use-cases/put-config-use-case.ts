import {Config, ConfigStore} from '../config-store';

export interface PutConfigRequest {
  config: Config;
}

export interface PutConfigResponse {}

export interface PutConfigUseCaseDeps {
  configStore: ConfigStore;
}

export function createPutConfigUseCase(
  deps: PutConfigUseCaseDeps,
): (data: PutConfigRequest) => Promise<PutConfigResponse> {
  return async (req: PutConfigRequest) => {
    const {configStore} = deps;

    // Implement the use case logic here
    await configStore.put(req.config);

    return {};
  };
}
