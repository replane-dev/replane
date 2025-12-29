// Admin API route handler for Next.js
// In production, this is served directly via Hono in server.ts

import {createAdminApi} from '@/admin-api';
import {getEngineSingleton} from '@/engine/engine-singleton';
import {NextRequest, NextResponse} from 'next/server';

export const dynamic = 'force-dynamic';
export const revalidate = 0;
export const fetchCache = 'force-no-store';
export const runtime = 'nodejs';

let adminApi: Promise<ReturnType<typeof createAdminApi>> | undefined = undefined;

async function getAdminApi() {
  if (!adminApi) {
    adminApi = getEngineSingleton().then(engine => createAdminApi(engine));
  }
  return await adminApi;
}

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
export async function OPTIONS(req: NextRequest) {
  return handleRequest(req);
}

async function handleRequest(req: NextRequest): Promise<NextResponse> {
  const adminApi = await getAdminApi();

  // Reconstruct the path that Hono should see (strip prefix up to /api/admin/v1)
  const url = new URL(req.url);
  const originalPath = url.pathname;
  // Expect pattern /api/admin/v1/<hono-path>
  const prefix = '/api/admin/v1';
  let honoPath = originalPath.startsWith(prefix) ? originalPath.slice(prefix.length) : originalPath;
  if (!honoPath.startsWith('/')) honoPath = '/' + honoPath;

  // Build a Fetch API Request that Hono understands with adjusted path
  const honoUrl = new URL(url.toString());
  honoUrl.pathname = honoPath;

  const honoRequest = new Request(honoUrl, {
    method: req.method,
    headers: req.headers,
    body: req.method === 'GET' || req.method === 'HEAD' ? undefined : await req.blob(),
  });

  const response = await adminApi.fetch(honoRequest);
  return new NextResponse(response.body, {
    headers: response.headers,
    status: response.status,
  });
}
