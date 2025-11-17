import {ConfigName} from '@/engine/core/config-store';
import {type Context} from '@/engine/core/context';
import {BadRequestError, ForbiddenError} from '@/engine/core/errors';
import {createUuidV4} from '@/engine/core/uuid';
import {getEngineSingleton} from '@/engine/engine-singleton';
import {OpenAPIHono} from '@hono/zod-openapi';
import {cors} from 'hono/cors';
import {z} from 'zod';

async function getEngine() {
  return getEngineSingleton();
}

interface HonoEnv {
  Variables: {
    context: Context;
    projectId: string;
  };
}

export const honoApi = new OpenAPIHono<HonoEnv>();

const ConfigValueResponse = z
  .object({
    name: ConfigName(),
    value: z.unknown(),
  })
  .openapi('ConfigValueResponse');

honoApi.use(
  '*',
  cors({
    origin: '*',
    allowMethods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  }),
);

honoApi.use('*', async (c, next) => {
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
  if (!token) return c.json({msg: 'Missing API key'}, 401);
  try {
    const engine = await getEngine();
    const verified = await engine.verifyApiKey(token);
    if (!verified) return c.json({msg: 'Invalid API key'}, 401);
    c.set('projectId', verified.projectId);
    await next();
  } catch (e) {
    console.error(e);
    return c.json({msg: 'Auth failure'}, 500);
  }
});

honoApi.openapi(
  {
    method: 'get',
    path: '/configs/{name}/value',
    operationId: 'getConfigValue',
    request: {
      params: z.object({name: ConfigName()}),
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
    try {
      const engine = await getEngine();
      const result = await engine.useCases.getConfigValue(c.get('context'), {
        name,
        projectId: c.get('projectId'),
      });

      if (typeof result.value === 'undefined') return c.json({msg: 'Not found'}, 404);

      return c.json(result.value, 200);
    } catch (err: unknown) {
      if (err instanceof BadRequestError) return c.json({msg: err.message}, 400);
      if (err instanceof ForbiddenError) return c.json({msg: 'Forbidden'}, 403);
      return c.json({msg: 'Internal server error'}, 500);
    }
  },
);

honoApi.openapi(
  {
    method: 'get',
    path: '/events',
    operationId: 'getProjectEvents',
    responses: {
      200: {
        description: 'Server-sent events stream for project updates',
        content: {
          'text/event-stream': {
            schema: z.object({}),
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

    const events = engine.useCases.getProjectEvents(context, {
      projectId,
      abortSignal: abortController.signal,
    });

    const encoder = new TextEncoder();

    const stream = new ReadableStream<Uint8Array>({
      async start(controller) {
        let errored = false;
        // heartbeat to keep proxies from closing the connection due to inactivity
        const heartbeat = setInterval(() => {
          try {
            controller.enqueue(encoder.encode(`: ping\n\n`));
          } catch {}
        }, 15000);

        try {
          controller.enqueue(encoder.encode(`: connected\n\n`));

          for await (const event of events) {
            const data = JSON.stringify(event);
            controller.enqueue(encoder.encode(`data: ${data}\n\n`));
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
            } catch {}
          }
        }
      },
      async cancel() {
        abortController.abort();
        c.req.raw.signal.removeEventListener('abort', onAbort);
      },
    });

    return new Response(stream, {headers});
  },
);

honoApi.get('/openapi.json', c =>
  c.json(
    honoApi.getOpenAPI31Document({
      openapi: '3.1.0',
      info: {title: 'Replane API', version: '1.0.0'},
      servers: [{url: 'http://localhost:3000/api/v1'}],
    }),
  ),
);
