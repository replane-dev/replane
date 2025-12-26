import {trimEnd} from '@/engine/core/utils';
import {getHealthcheckPath} from '@/environment';
import {withAuth} from 'next-auth/middleware';
import {NextRequest, NextResponse} from 'next/server';

// Auth middleware instance for non-healthcheck routes
const auth = withAuth({});

const HEALTHCHECK_PATH = getHealthcheckPath();

export default async function proxy(req: NextRequest, event: any) {
  const pathname = trimEnd(req.nextUrl.pathname, '/');

  if (pathname === HEALTHCHECK_PATH) {
    return NextResponse.json({status: 'ok'});
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
