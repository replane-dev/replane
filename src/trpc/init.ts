import {createEngine} from '@/engine/engine';
import {initTRPC} from '@trpc/server';
import {cache} from 'react';

const engine = await createEngine({
  databaseUrl: process.env.DATABASE_URL!,
  loggingLevel: 'info',
  dbSchema: 'public',
});

export const createTRPCContext = cache(async () => {
  /**
   * @see: https://trpc.io/docs/server/context
   */
  return {userId: 'user_123', engine};
});
// Avoid exporting the entire t-object
// since it's not very descriptive.
// For instance, the use of a t variable
// is common in i18n libraries.
const t = initTRPC.context<ReturnType<typeof createTRPCContext>>().create({
  /**
   * @see https://trpc.io/docs/server/data-transformers
   */
  // transformer: superjson,
});
// Base router and procedure helpers
export const createTRPCRouter = t.router;
export const createCallerFactory = t.createCallerFactory;
export const baseProcedure = t.procedure;
