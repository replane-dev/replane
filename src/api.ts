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

honoApi.get('/events', async c => {
  const projectId = c.get('projectId');
  const context = c.get('context');

  const engine = await getEngine();
  const events = engine.useCases.getProjectEvents(context, {projectId});

  // Set SSE headers
  c.header('Content-Type', 'text/event-stream');
  c.header('Cache-Control', 'no-cache');
  c.header('Connection', 'keep-alive');

  // Create a readable stream for SSE
  const stream = new ReadableStream({
    async start(controller) {
      try {
        for await (const event of events) {
          // Format as SSE message
          const data = JSON.stringify(event);
          const message = `data: ${data}\n\n`;
          controller.enqueue(new TextEncoder().encode(message));
        }
      } catch (error) {
        console.error('SSE stream error:', error);
        controller.error(error);
      } finally {
        controller.close();
      }
    },
    cancel() {
      // Cleanup happens automatically via the async iterator's finally block
      console.log('SSE connection closed by client');
    },
  });

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      Connection: 'keep-alive',
    },
  });
});

honoApi.get('/openapi.json', c =>
  c.json(
    honoApi.getOpenAPI31Document({
      openapi: '3.1.0',
      info: {title: 'Replane API', version: '1.0.0'},
    }),
  ),
);
