import {getAuthOptions} from '@/app/auth-options';
import {BadRequestError} from '@/engine/core/errors';
import {createUserIdentity, type Identity} from '@/engine/core/identity';
import {normalizeEmail} from '@/engine/core/utils';
import type {Engine} from '@/engine/engine';
import {getEngineSingleton} from '@/engine/engine-singleton';
import * as Sentry from '@sentry/nextjs';
import {initTRPC} from '@trpc/server';
import {getServerSession} from 'next-auth';
import {cache} from 'react';
import superjson from 'superjson';

export interface TrpcContext {
  identity: Identity | undefined;
  engine: Engine;
}

/**
 * @see: https://trpc.io/docs/server/context
 */
export const createTrpcContext = cache(async (): Promise<TrpcContext> => {
  const session = await getServerSession(getAuthOptions());
  const email = session?.user?.email ? normalizeEmail(session.user.email) : undefined;

  const engine = await getEngineSingleton();

  if (!email) {
    return {
      identity: undefined,
      engine,
    };
  }

  const user = await engine.stores.users.getByEmail(email);
  if (!user) {
    console.error(`User not found for email: ${email}`);
    return {
      identity: undefined,
      engine,
    };
  }

  return {
    identity: createUserIdentity({
      email,
      id: user.id,
      name: user.name ?? null,
    }),
    engine,
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
  transformer: superjson,
  errorFormatter: ({shape, error, path}) => {
    // Only capture server errors to Sentry, not client errors (crawlers, bad requests, etc.)
    const isClientError =
      error.code === 'PARSE_ERROR' ||
      error.code === 'BAD_REQUEST' ||
      error.code === 'UNAUTHORIZED' ||
      error.code === 'NOT_FOUND' ||
      error.code === 'FORBIDDEN' ||
      error.code === 'METHOD_NOT_SUPPORTED' ||
      error.code === 'TIMEOUT' ||
      error.code === 'CONFLICT' ||
      error.code === 'PRECONDITION_FAILED' ||
      error.code === 'PAYLOAD_TOO_LARGE' ||
      error.code === 'UNPROCESSABLE_CONTENT' ||
      error.code === 'TOO_MANY_REQUESTS' ||
      error.code === 'CLIENT_CLOSED_REQUEST';

    if (!isClientError) {
      Sentry.captureException(error.cause ?? error, {
        extra: {
          path,
          code: error.code,
        },
      });
    }

    // Pass through BadRequestError codes to the frontend
    if (error.cause instanceof BadRequestError && error.cause.code) {
      return {
        ...shape,
        data: {
          ...shape.data,
          cause: {
            code: error.cause.code,
          },
        },
      };
    }

    return shape;
  },
});

const sentryMiddleware = Sentry.trpcMiddleware({
  attachRpcInput: true,
});

// Base router and procedure helpers
export const createTRPCRouter = t.router;
export const createCallerFactory = t.createCallerFactory;
export const baseProcedure = t.procedure.use(sentryMiddleware);
