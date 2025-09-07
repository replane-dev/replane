import {ConfigName} from '@/engine/core/config-store';
import {type Context} from '@/engine/core/context';
import {BadRequestError, ForbiddenError} from '@/engine/core/errors';
import {createUuidV4} from '@/engine/core/uuid';
import {getEngineSingleton} from '@/engine/engine-singleton';
import {OpenAPIHono} from '@hono/zod-openapi';
import {NextRequest} from 'next/server';
import {z} from 'zod';

async function getEngine() {
  return getEngineSingleton();
}

interface HonoEnv {
  Variables: {
    context: Context;
  };
}

// OpenAPI-enabled Hono app
const app = new OpenAPIHono<HonoEnv>();

// Public endpoint example (still can be protected if desired). We'll enforce auth globally below, but allowlist openapi & hello.
app.get('/hello', c => c.json({message: 'Hello from Hono'}));

// Schemas
const ConfigValueResponse = z
  .object({
    name: ConfigName(),
    value: z.unknown(),
  })
  .openapi('ConfigValueResponse');

// Global Auth middleware (all routes) except openapi spec & hello for now.
app.use('*', async (c, next) => {
  c.set('context', {traceId: createUuidV4()});

  const path = new URL(c.req.url).pathname;
  if (path.endsWith('/openapi.json') || path === '/hello') {
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
    await next();
  } catch (e) {
    console.error(e);
    return c.json({msg: 'Auth failure'}, 500);
  }
});

// Route: GET /configs/:name/value (requires API key)
app.openapi(
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
      });
      if (typeof result.value === 'undefined') return c.json({msg: 'Not found'}, 404);
      return c.json({name, value: result.value}, 200);
    } catch (err: unknown) {
      if (err instanceof BadRequestError) return c.json({msg: err.message}, 400);
      if (err instanceof ForbiddenError) return c.json({msg: 'Forbidden'}, 403);
      console.error(err);
      return c.json({msg: 'Internal server error'}, 500);
    }
  },
);

// OpenAPI JSON spec (optional exposure)
app.get('/openapi.json', c =>
  c.json(
    app.getOpenAPI31Document({
      openapi: '3.1.0',
      info: {title: 'Replane API', version: '1.0.0'},
    }),
  ),
);

// Use Node.js runtime (engine depends on Node APIs like pg & crypto)
export const runtime = 'nodejs';

export async function GET(req: NextRequest) {
  return handleRequest(req);
}
export async function POST(req: NextRequest) {
  return handleRequest(req);
}
export async function PUT(req: NextRequest) {
  return handleRequest(req);
}
export async function PATCH(req: NextRequest) {
  return handleRequest(req);
}
export async function DELETE(req: NextRequest) {
  return handleRequest(req);
}

async function handleRequest(req: NextRequest): Promise<Response> {
  // Reconstruct the path that Hono should see (strip prefix up to /api/v1)
  const url = new URL(req.url);
  const originalPath = url.pathname;
  // Expect pattern /api/v1/<hono-path>
  const prefix = '/api/v1';
  let honoPath = originalPath.startsWith(prefix) ? originalPath.slice(prefix.length) : originalPath;
  if (!honoPath.startsWith('/')) honoPath = '/' + honoPath;

  // Build a Fetch API Request that Hono understands with adjusted path
  const honoUrl = new URL(url.toString());
  honoUrl.pathname = honoPath;

  const honoRequest = new Request(honoUrl, {
    method: req.method,
    headers: req.headers as any,
    body: req.method === 'GET' || req.method === 'HEAD' ? undefined : await req.blob(),
  });

  return app.fetch(honoRequest);
}
