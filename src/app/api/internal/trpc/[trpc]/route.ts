import {createTrpcContext} from '@/trpc/init';
import {appRouter} from '@/trpc/routers/_app';
import {fetchRequestHandler} from '@trpc/server/adapters/fetch';

export const dynamic = 'force-dynamic';
export const revalidate = 0;
export const fetchCache = 'force-no-store';
export const runtime = 'nodejs';

const handler = async (req: Request) => {
  return fetchRequestHandler({
    endpoint: '/api/internal/trpc',
    req,
    router: appRouter,
    createContext: createTrpcContext,
  });
};
export {handler as GET, handler as POST};
