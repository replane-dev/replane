import {type Context} from '@/engine/core/context';
import {BadRequestError, ForbiddenError} from '@/engine/core/errors';
import {ConfigName} from '@/engine/core/stores/config-store';
import {createUuidV4} from '@/engine/core/uuid';
import {getEngineSingleton} from '@/engine/engine-singleton';
import {OpenAPIHono} from '@hono/zod-openapi';
import {cors} from 'hono/cors';
import {HTTPException} from 'hono/http-exception';
import {z} from 'zod';
import {RenderedOverrideSchema} from './engine/core/override-condition-schemas';
import {assertNever, toEagerAsyncIterable} from './engine/core/utils';

async function getEngine() {
  return getEngineSingleton();
}

interface HonoEnv {
  Variables: {
    context: Context;
    environmentId: string;
    projectId: string;
  };
}

export const sdkApi = new OpenAPIHono<HonoEnv>();

const ConfigValueResponse = z
  .object({
    name: ConfigName(),
    value: z.unknown(),
  })
  .openapi('ConfigValueResponse');

const ConfigResponse = z
  .object({
    name: ConfigName(),
    value: z.unknown(),
    renderedOverrides: z.array(RenderedOverrideSchema),
    overrides: z.array(RenderedOverrideSchema),
    version: z.number(),
  })
  .openapi('ConfigResponse');

type ConfigResponse = z.infer<typeof ConfigResponse>;

const ConfigsResponse = z
  .object({
    items: z.array(ConfigResponse),
  })
  .openapi('ConfigsResponse');

type ConfigsResponse = z.infer<typeof ConfigsResponse>;

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
    const engine = await getEngine();
    const ctx = c.get('context');
    const verified = await engine.sdkUseCases.verifySdkKey(ctx, {key: token});
    if (!verified) return c.json({msg: 'Invalid SDK key'}, 401);
    c.set('projectId', verified.projectId);
    c.set('environmentId', verified.environmentId);
    await next();
  } catch (e) {
    console.error(e);
    return c.json({msg: 'Auth failure'}, 500);
  }
});

sdkApi.openapi(
  {
    method: 'get',
    path: '/configs/{name}/value',
    operationId: 'getConfigValue',
    request: {
      params: z.object({name: ConfigName()}).openapi({
        description:
          'A config name consisting of letters (A-Z, a-z), digits, underscores or hyphens, 1-100 characters long',
      }),
      query: z.object({
        context: z
          .string()
          .optional()
          .openapi({description: 'A JSON string of context (like userEmail, tier, etc.)'}),
      }),
    },
    responses: {
      200: {
        description: 'Config value (if found)',
        content: {
          'application/json': {
            schema: ConfigValueResponse,
          },
        },
      },
      404: {description: 'Config not found'},
      400: {description: 'Bad request'},
      403: {description: 'Forbidden'},
    },
  },
  async c => {
    const {name} = c.req.valid('param');
    const {context: contextStr} = c.req.valid('query');

    const engine = await getEngine();

    // Parse context if provided
    let context: Record<string, unknown> | undefined;
    if (contextStr) {
      try {
        context = JSON.parse(contextStr);
        if (typeof context !== 'object' || context === null) {
          throw new HTTPException(400, {message: 'context must be a JSON object'});
        }
      } catch (e) {
        if (e instanceof HTTPException) throw e;
        throw new HTTPException(400, {message: 'Invalid JSON in context parameter'});
      }
    }

    const result = await engine.sdkUseCases.getConfigValue(c.get('context'), {
      name,
      projectId: c.get('projectId'),
      environmentId: c.get('environmentId'),
      context,
    });

    if (typeof result.value === 'undefined') {
      throw new HTTPException(404, {message: 'Not found'});
    }

    return c.json(result.value, 200);
  },
);

sdkApi.openapi(
  {
    method: 'get',
    path: '/configs',
    operationId: 'getConfigs',
    responses: {
      200: {
        description: 'Configs',
        content: {
          'application/json': {
            schema: ConfigsResponse,
          },
        },
      },
    },
  },
  async c => {
    const engine = await getEngine();
    const {configs} = await engine.sdkUseCases.getSdkConfigs(c.get('context'), {
      projectId: c.get('projectId'),
      environmentId: c.get('environmentId'),
    });
    return c.json({items: configs}, 200);
  },
);

sdkApi.openapi(
  {
    method: 'get',
    path: '/configs/{name}',
    operationId: 'getConfig',
    request: {
      params: z.object({name: ConfigName()}).openapi({
        description:
          'A config name consisting of letters (A-Z, a-z), digits, underscores or hyphens, 1-100 characters long',
      }),
    },
    responses: {
      200: {
        description: 'Config details',
        content: {
          'application/json': {
            schema: ConfigResponse,
          },
        },
      },
      404: {description: 'Config not found'},
      400: {description: 'Bad request'},
      403: {description: 'Forbidden'},
    },
  },
  async c => {
    const {name} = c.req.valid('param');

    const engine = await getEngine();

    const result = await engine.sdkUseCases.getSdkConfig(c.get('context'), {
      name,
      projectId: c.get('projectId'),
      environmentId: c.get('environmentId'),
    });

    if (!result) {
      throw new HTTPException(404, {message: 'Not found'});
    }

    return c.json(result, 200);
  },
);

const ConfigCreatedEventResponse = z
  .object({
    type: z.literal('config_created'),
    configName: ConfigName(),
    overrides: z.array(RenderedOverrideSchema),
    version: z.number(),
    value: z.unknown(),
  })
  .openapi('ConfigCreatedEventResponse');

const ConfigUpdatedEventResponse = z
  .object({
    type: z.literal('config_updated'),
    configName: ConfigName(),
    overrides: z.array(RenderedOverrideSchema),
    version: z.number(),
    value: z.unknown(),
  })
  .openapi('ConfigUpdatedEventResponse');

const ConfigDeletedEventResponse = z
  .object({
    type: z.literal('config_deleted'),
    configName: ConfigName(),
    version: z.number(),
  })
  .openapi('ConfigDeletedEventResponse');

const ConfigListEventResponse = z
  .object({
    type: z.literal('config_list'),
    configs: z.array(ConfigResponse),
  })
  .openapi('ConfigListEventResponse');

type ConfigListEventResponse = z.infer<typeof ConfigListEventResponse>;

const ReplicationStreamResponse = z
  .discriminatedUnion('type', [
    ConfigCreatedEventResponse,
    ConfigUpdatedEventResponse,
    ConfigDeletedEventResponse,
    ConfigListEventResponse,
  ])
  .openapi('ProjectEventResponse', {
    description: 'Server-sent events stream for project updates',
  });

type ReplicationStreamResponse = z.infer<typeof ReplicationStreamResponse>;

// todo: remove /events endpoint before v1.0.0
[
  {path: '/replication/stream', operationId: 'getReplicationStream'},
  {path: '/events', operationId: 'getProjectEvents'},
].forEach(({path, operationId}) =>
  sdkApi.openapi(
    {
      method: 'get',
      path,
      operationId,
      responses: {
        200: {
          description: 'Server-sent events stream for project updates',
          content: {
            'text/event-stream': {
              schema: ReplicationStreamResponse,
            },
          },
        },
      },
    },

    async c => {
      const projectId = c.get('projectId');
      const context = c.get('context');
      const engine = await getEngine();

      const headers = {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache, no-transform',
        Connection: 'keep-alive',
        'X-Accel-Buffering': 'no',
      };

      const abortController = new AbortController();
      const onAbort = () => abortController.abort();
      c.req.raw.signal.addEventListener('abort', onAbort);

      const stream = new ReadableStream<SseEvent>({
        async start(controller) {
          let errored = false;
          // heartbeat to keep proxies from closing the connection due to inactivity
          const heartbeat = setInterval(() => {
            try {
              controller.enqueue({type: 'ping'});
            } catch {}
          }, 15_000);

          try {
            controller.enqueue({type: 'connected'});

            // eager async iterable to subscribe to events immediately
            // required for client not to miss any updates to configs
            const events = toEagerAsyncIterable(
              engine.sdkUseCases.getProjectEvents(context, {
                projectId,
                environmentId: c.get('environmentId'),
                abortSignal: abortController.signal,
              }),
            );

            const {configs} = await engine.sdkUseCases.getSdkConfigs(context, {
              projectId,
              environmentId: c.get('environmentId'),
            });
            const data = JSON.stringify({
              type: 'config_list',
              configs,
            } satisfies ConfigListEventResponse);
            controller.enqueue({type: 'data', data});

            for await (const event of events) {
              const data = JSON.stringify(event satisfies ReplicationStreamResponse);
              controller.enqueue({type: 'data', data});
            }
          } catch (err) {
            errored = true;
            console.error('SSE stream error:', err);
            controller.error(err);
          } finally {
            clearInterval(heartbeat);
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
        async cancel() {
          abortController.abort();
          c.req.raw.signal.removeEventListener('abort', onAbort);
        },
      }).pipeThrough(new SseEncoderStream());

      return new Response(stream, {headers});
    },
  ),
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

type SseEvent = {type: 'data'; data: string} | {type: 'ping'} | {type: 'connected'};

class SseEncoderStream extends TransformStream<SseEvent, Uint8Array> {
  constructor() {
    const encoder = new TextEncoder();

    super({
      transform(chunk, controller) {
        if (chunk.type === 'data') {
          controller.enqueue(encoder.encode(`data: ${chunk.data}\n\n`));
        } else if (chunk.type === 'ping') {
          controller.enqueue(encoder.encode(': ping\n\n'));
        } else if (chunk.type === 'connected') {
          controller.enqueue(encoder.encode(': connected\n\n'));
        } else {
          assertNever(chunk, 'Unknown SSE event type');
        }
      },
    });
  }
}
