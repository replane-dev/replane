import {type Context} from '@/engine/core/context';
import {BadRequestError, ForbiddenError} from '@/engine/core/errors';
import {ConfigName} from '@/engine/core/stores/config-store';
import {createUuidV4} from '@/engine/core/uuid';
import {getEdgeSingleton} from '@/engine/edge-singleton';
import {OpenAPIHono} from '@hono/zod-openapi';
import * as Sentry from '@sentry/nextjs';
import {cors} from 'hono/cors';
import {HTTPException} from 'hono/http-exception';
import {z} from 'zod';
import {RenderedOverrideSchema} from './engine/core/override-condition-schemas';
import {assertNever, toEagerAsyncIterable} from './engine/core/utils';

async function getEdge() {
  return getEdgeSingleton();
}

interface HonoEnv {
  Variables: {
    context: Context;
    environmentId: string;
    projectId: string;
  };
}

export const sdkApi = new OpenAPIHono<HonoEnv>();

// Global error handler
sdkApi.onError((err, c) => {
  if (err instanceof HTTPException) {
    return err.getResponse();
  }

  if (err instanceof BadRequestError) {
    return c.json({msg: err.message}, 400);
  }

  if (err instanceof ForbiddenError) {
    return c.json({msg: 'Forbidden'}, 403);
  }

  Sentry.captureException(err, {
    extra: {
      method: c.req.method,
      url: c.req.url,
      path: c.req.path,
    },
  });

  console.error('API error:', err);
  return c.json({msg: 'Internal server error'}, 500);
});

sdkApi.use(
  '*',
  cors({
    origin: '*',
    allowMethods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  }),
);

sdkApi.use('*', async (c, next) => {
  c.set('context', {traceId: createUuidV4()});

  const path = new URL(c.req.url).pathname;
  if (path.endsWith('/openapi.json')) {
    return next();
  }
  const authHeader = c.req.header('authorization');
  const bearer = authHeader?.toLowerCase().startsWith('bearer ')
    ? authHeader.slice(7).trim()
    : undefined;
  const token = bearer;
  if (!token) return c.json({msg: 'Missing SDK key'}, 401);
  try {
    const edge = await getEdge();
    const ctx = c.get('context');
    const verified = await edge.useCases.verifySdkKey(ctx, {key: token});
    if (!verified) return c.json({msg: 'Invalid SDK key'}, 401);
    c.set('projectId', verified.projectId);
    c.set('environmentId', verified.environmentId);
    await next();
  } catch (e) {
    Sentry.captureException(e, {
      extra: {
        method: c.req.method,
        url: c.req.url,
        path: c.req.path,
      },
    });
    console.error(e);
    return c.json({msg: 'Auth failure'}, 500);
  }
});

const SdkConfigDto = z
  .object({
    name: ConfigName(),
    value: z.unknown(),
    overrides: z.array(RenderedOverrideSchema),
  })
  .openapi('SdkConfigDto');

export type SdkConfigDto = z.infer<typeof SdkConfigDto>;

const ReplicationStreamConfigChangeRecord = z
  .object({
    type: z.literal('config_change'),
    config: SdkConfigDto,
  })
  .openapi('ReplicationStreamConfigChangeRecord');

const ReplicationStreamInitRecord = z
  .object({
    type: z.literal('init'),
    configs: z.array(SdkConfigDto),
  })
  .openapi('ReplicationStreamInitRecord');

type ReplicationStreamInitRecord = z.infer<typeof ReplicationStreamInitRecord>;

const ReplicationStreamRecord = z
  .discriminatedUnion('type', [ReplicationStreamConfigChangeRecord, ReplicationStreamInitRecord])
  .openapi('ReplicationStreamRecord');

type ReplicationStreamRecord = z.infer<typeof ReplicationStreamRecord>;

const StartReplicationStreamBody = z
  .object({
    currentConfigs: z.array(SdkConfigDto).optional(),
    requiredConfigs: z.array(z.string()).optional(),
  })
  .openapi('StartReplicationStreamBody');

export type StartReplicationStreamBody = z.infer<typeof StartReplicationStreamBody>;

sdkApi.openapi(
  {
    method: 'post',
    path: '/replication/stream',
    operationId: 'startReplicationStream',
    responses: {
      200: {
        description: 'Replication stream in SSE format',
        content: {
          'text/event-stream': {
            schema: ReplicationStreamRecord,
          },
        },
      },
    },
    request: {
      headers: z.object({
        'x-stream-timeout-ms': z.string().optional().openapi({
          description:
            'Maximum stream lifetime in milliseconds. Server will close the stream after this timeout.',
          example: '60000',
        }),
      }),
      body: {
        content: {
          'application/json': {
            schema: StartReplicationStreamBody,
          },
        },
      },
    },
  },

  async c => {
    const projectId = c.get('projectId');
    const context = c.get('context');
    const edge = await getEdge();

    const abortController = new AbortController();
    const onAbort = () => abortController.abort();
    c.req.raw.signal.addEventListener('abort', onAbort);

    // Parse optional stream timeout header
    const timeoutHeader = c.req.header('x-stream-timeout-ms');
    let streamTimeoutMs = timeoutHeader ? parseInt(timeoutHeader, 10) : null;
    if (Number.isNaN(streamTimeoutMs)) {
      console.warn('Invalid stream timeout header:', timeoutHeader);
      streamTimeoutMs = null;
    }

    const rawBody = await c.req.json().catch(() => ({}));
    const parseResult = StartReplicationStreamBody.safeParse(rawBody);
    if (!parseResult.success) {
      throw new HTTPException(400, {
        message: `Invalid request body: ${parseResult.error.issues.map(e => `${e.path.join('.')}: ${e.message}`).join(', ')}`,
      });
    }
    const clientState = parseResult.data;

    const stream = new ReadableStream<SseEvent>({
      async start(controller) {
        let errored = false;
        // heartbeat to keep proxies from closing the connection due to inactivity
        const heartbeat = setInterval(() => {
          try {
            controller.enqueue({type: 'comment', comment: 'ping'});
          } catch {}
        }, 15_000);

        // Optional stream timeout - close stream after specified duration
        let streamTimeout: ReturnType<typeof setTimeout> | null = null;
        if (streamTimeoutMs && streamTimeoutMs > 0) {
          streamTimeout = setTimeout(() => {
            try {
              controller.enqueue({type: 'comment', comment: 'timeout'});
            } catch {}
            // Small delay to allow the timeout event to be sent before closing
            setTimeout(() => abortController.abort(), 50);
          }, streamTimeoutMs);
        }

        try {
          controller.enqueue({type: 'comment', comment: 'connected'});

          // eager async iterable to subscribe to events immediately
          // required for client not to miss any updates to configs
          const events = toEagerAsyncIterable(
            edge.useCases.getProjectEvents(context, {
              projectId,
              environmentId: c.get('environmentId'),
              abortSignal: abortController.signal,
            }),
          );

          const {configs: serverConfigs} = await edge.useCases.getSdkConfigs(context, {
            projectId,
            environmentId: c.get('environmentId'),
          });

          const configs = createSdkState({
            serverConfigs: serverConfigs,
            currentConfigs: clientState.currentConfigs,
            requiredConfigs: clientState.requiredConfigs,
          });
          controller.enqueue({
            type: 'data',
            data: JSON.stringify({
              type: 'init',
              configs,
            } satisfies ReplicationStreamRecord),
          });

          for await (const event of events) {
            if (event.type === 'config_deleted') continue;

            controller.enqueue({
              type: 'data',
              data: JSON.stringify({
                type: 'config_change',
                config: {
                  name: event.configName,
                  overrides: event.overrides,
                  value: event.value,
                },
              } satisfies ReplicationStreamRecord),
            });
          }
        } catch (err) {
          errored = true;
          Sentry.captureException(err, {
            extra: {
              endpoint: '/replication/stream',
              projectId,
            },
          });
          console.error('SSE stream error:', err);
          controller.error(err);
        } finally {
          clearInterval(heartbeat);
          if (streamTimeout) clearTimeout(streamTimeout);
          abortController.abort();
          c.req.raw.signal.removeEventListener('abort', onAbort);
          if (!errored) {
            try {
              controller.close();
            } catch {
              // ignore
            }
          }
        }
      },
      cancel() {
        abortController.abort();
        c.req.raw.signal.removeEventListener('abort', onAbort);
      },
    }).pipeThrough(new SseEncoderStream());

    return new Response(stream, {
      headers: {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache, no-transform',
        Connection: 'keep-alive',
        'X-Accel-Buffering': 'no',
      },
    });
  },
);

sdkApi.get('/openapi.json', c =>
  c.json(
    sdkApi.getOpenAPI31Document({
      openapi: '3.1.0',
      info: {title: 'Replane API', version: '1.0.0'},
      servers: [{url: 'http://localhost:8080/api/v1'}],
    }),
  ),
);

type SseEvent = {type: 'data'; data: string} | {type: 'comment'; comment: string};

class SseEncoderStream extends TransformStream<SseEvent, Uint8Array> {
  constructor() {
    const encoder = new TextEncoder();

    super({
      transform(chunk, controller) {
        if (chunk.type === 'data') {
          controller.enqueue(encoder.encode(`data: ${chunk.data}\n\n`));
        } else if (chunk.type === 'comment') {
          controller.enqueue(encoder.encode(`: ${chunk.comment}\n\n`));
        } else {
          assertNever(chunk, 'Unknown SSE event type');
        }
      },
    });
  }
}

export function createSdkState(
  options: StartReplicationStreamBody & {serverConfigs: SdkConfigDto[]},
): SdkConfigDto[] {
  const configs = new Map<string, SdkConfigDto>();
  for (const config of options.currentConfigs ?? []) {
    configs.set(config.name, config);
  }

  for (const config of options.serverConfigs) {
    configs.set(config.name, config);
  }

  const missingConfigs = new Set<string>();
  for (const configName of options.requiredConfigs ?? []) {
    if (!configs.has(configName)) {
      missingConfigs.add(configName);
    }
  }
  if (missingConfigs.size > 0) {
    throw new Error(`Required configs not found: ${Array.from(missingConfigs).join(', ')}`);
  }

  return Array.from(configs.values());
}
