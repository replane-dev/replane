import {createTrpcContext} from '@/trpc/init';
import {appRouter} from '@/trpc/routers/_app';
import {fetchRequestHandler} from '@trpc/server/adapters/fetch';

export const dynamic = 'force-dynamic';
export const revalidate = 0;
export const fetchCache = 'force-no-store';
export const runtime = 'nodejs';

// Client errors that shouldn't be logged at error level
const CLIENT_ERROR_CODES = new Set([
  'PARSE_ERROR',
  'BAD_REQUEST',
  'UNAUTHORIZED',
  'NOT_FOUND',
  'FORBIDDEN',
  'METHOD_NOT_SUPPORTED',
  'TIMEOUT',
  'CONFLICT',
  'PRECONDITION_FAILED',
  'PAYLOAD_TOO_LARGE',
  'UNPROCESSABLE_CONTENT',
  'TOO_MANY_REQUESTS',
  'CLIENT_CLOSED_REQUEST',
]);

const handler = async (req: Request) => {
  return fetchRequestHandler({
    endpoint: '/api/internal/trpc',
    req,
    router: appRouter,
    createContext: createTrpcContext,
    onError: ({error, path, input, type, ctx}) => {
      if (CLIENT_ERROR_CODES.has(error.code)) {
        // Client errors (crawlers, bad requests, etc.) - log at warn level
        console.warn(`tRPC client error [${error.code}]: ${error.message}`);
      } else {
        // Server errors - log at error level
        console.error(error);
      }
    },
  });
};
export {handler as GET, handler as POST};
