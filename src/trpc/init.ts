import {Lazy} from '@/engine/core/lazy';
import {createEngine, Engine} from '@/engine/engine';
import {initTRPC} from '@trpc/server';
import {cache} from 'react';

export interface TrpcContext {
  userId: string;
  engine: Engine;
}

const engine = new Lazy(async () => {
  return await createEngine({
    databaseUrl: process.env.DATABASE_URL!,
    logLevel: 'info',
    dbSchema: 'public',
  });
});

export const createTrpcContext = cache(async (): Promise<TrpcContext> => {
  /**
   * @see: https://trpc.io/docs/server/context
   */
  return {userId: 'user_123', engine: await engine.get()};
});

// Avoid exporting the entire t-object
// since it's not very descriptive.
// For instance, the use of a t variable
// is common in i18n libraries.
const t = initTRPC.context<TrpcContext>().create({
  /**
   * @see https://trpc.io/docs/server/data-transformers
   */
  // transformer: superjson,
});
// Base router and procedure helpers
export const createTRPCRouter = t.router;
export const createCallerFactory = t.createCallerFactory;
export const baseProcedure = t.procedure;
