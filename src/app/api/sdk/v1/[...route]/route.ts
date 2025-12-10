// this file exists only for local development, in production we use hono directly in server.ts
// to avoid the overhead of Next.js API routes

import {sdkApi} from '@/sdk-api';
import {NextRequest, NextResponse} from 'next/server';

export const dynamic = 'force-dynamic';
export const revalidate = 0;
export const fetchCache = 'force-no-store';
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
export async function OPTIONS(req: NextRequest) {
  return handleRequest(req);
}

async function handleRequest(req: NextRequest): Promise<NextResponse> {
  // Reconstruct the path that Hono should see (strip prefix up to /api/sdk/v1)
  const url = new URL(req.url);
  const originalPath = url.pathname;
  // Expect pattern /api/sdk/v1/<hono-path>
  const prefix = '/api/sdk/v1';
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

  const response = await sdkApi.fetch(honoRequest);
  return new NextResponse(response.body, {
    headers: response.headers,
    status: response.status,
  });
}
