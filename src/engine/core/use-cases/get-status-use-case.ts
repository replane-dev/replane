import type {Kysely} from 'kysely';
import type {DB} from '../db';
import type {UseCase} from '../use-case';

const startTime = Date.now();
const version = process.env.npm_package_version || 'unknown';

export interface StatusCheck {
  status: 'ok' | 'error';
  error?: string;
}

export interface GetStatusRequest {}

export interface GetStatusResponse {
  status: 'ok' | 'degraded';
  version: string;
  uptime: number;
  timestamp: string;
  checks: {
    database: StatusCheck;
  };
}

export interface GetStatusUseCaseOptions {
  db: Kysely<DB>;
}

export function createGetStatusUseCase(
  options: GetStatusUseCaseOptions,
): UseCase<GetStatusRequest, GetStatusResponse> {
  return async () => {
    const uptimeMs = Date.now() - startTime;
    const uptimeSeconds = Math.floor(uptimeMs / 1000);

    // Check database connectivity
    let databaseCheck: StatusCheck;
    try {
      await options.db.selectFrom('configs').select('id').limit(1).execute();
      databaseCheck = {status: 'ok'};
    } catch (error) {
      databaseCheck = {
        status: 'error',
        error: error instanceof Error ? error.message : 'Unknown error',
      };
    }

    const allHealthy = databaseCheck.status === 'ok';

    return {
      status: allHealthy ? 'ok' : 'degraded',
      version,
      uptime: uptimeSeconds,
      timestamp: new Date().toISOString(),
      checks: {
        database: databaseCheck,
      },
    };
  };
}
