import type {UseCase} from '../use-case';

const startTime = Date.now();
const version = process.env.npm_package_version || 'unknown';

export interface GetHealthRequest {}

export interface GetHealthResponse {
  status: 'ok';
  version: string;
  uptime: number;
  timestamp: string;
}

export function createGetHealthUseCase(): UseCase<GetHealthRequest, GetHealthResponse> {
  return async () => {
    const uptimeMs = Date.now() - startTime;
    const uptimeSeconds = Math.floor(uptimeMs / 1000);

    return {
      status: 'ok',
      version,
      uptime: uptimeSeconds,
      timestamp: new Date().toISOString(),
    };
  };
}
