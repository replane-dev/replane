import {authOptions} from '@/app/auth-options';
import {normalizeEmail} from '@/engine/core/utils';
import type {NormalizedEmail} from '@/engine/core/zod';
import type {Engine} from '@/engine/engine';
import {getEngineSingleton} from '@/engine/engine-singleton';
import {initTRPC} from '@trpc/server';
import {getServerSession} from 'next-auth';
import {cache} from 'react';

export interface TrpcContext {
  currentUserEmail: NormalizedEmail | undefined;
  engine: Engine;
}

/**
 * @see: https://trpc.io/docs/server/context
 */
export const createTrpcContext = cache(async (): Promise<TrpcContext> => {
  const session = await getServerSession(authOptions);

  return {
    currentUserEmail: session?.user?.email ? normalizeEmail(session.user.email) : undefined,
    engine: await getEngineSingleton(),
  };
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
