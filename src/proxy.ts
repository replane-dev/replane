import {trimEnd} from '@/engine/core/utils';
import {getHealthcheckPath} from '@/environment';
import {withAuth} from 'next-auth/middleware';
import {NextRequest, NextResponse} from 'next/server';

// Auth middleware instance for non-healthcheck routes
const auth = withAuth({});

const HEALTHCHECK_PATH = getHealthcheckPath();

const EDGE_URL_PREFIXES = ['/api/sdk/', '/_next/static', '/_next/image', '/favicon', '/metrics'];

export default async function proxy(req: NextRequest, event: any) {
  const pathname = trimEnd(req.nextUrl.pathname, '/');

  if (pathname === HEALTHCHECK_PATH) {
    return NextResponse.json({status: 'ok'});
  }

  // Fly.io: for non-SDK API calls, replay the request in the primary region if configured
  // for performance reasons (we have PostgreSQL in this region)
  const PRIMARY_REGION = process.env.PRIMARY_REGION;
  const FLY_REGION = process.env.FLY_REGION;
  if (
    PRIMARY_REGION &&
    FLY_REGION &&
    FLY_REGION !== PRIMARY_REGION &&
    EDGE_URL_PREFIXES.every(prefix => !pathname.startsWith(prefix))
  ) {
    return new NextResponse(null, {
      status: 307,
      headers: {
        'Fly-Replay': `region=${PRIMARY_REGION}`,
      },
    });
  }

  // Apply internal matcher logic: bypass auth for excluded paths
  if (
    pathname.startsWith('/api/') ||
    pathname.startsWith('/_next/static') ||
    pathname.startsWith('/_next/image') ||
    pathname.startsWith('/auth') ||
    pathname.startsWith('/favicon') ||
    pathname === '/favicon.ico' ||
    pathname === '/terms' ||
    pathname === '/privacy' ||
    pathname === '/metrics'
  ) {
    return NextResponse.next();
  }

  // Delegate non-healthcheck routes to NextAuth's middleware
  return await auth(req as any, event);
}
