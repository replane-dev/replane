import {withAuth} from 'next-auth/middleware';
import {NextRequest, NextResponse} from 'next/server';

// Auth middleware instance for non-healthcheck routes
const auth = withAuth({});

export default async function proxy(req: NextRequest, event: any) {
  const {pathname} = req.nextUrl;

  // Apply internal matcher logic: bypass auth for excluded paths
  if (
    pathname.startsWith('/api') ||
    pathname.startsWith('/_next/static') ||
    pathname.startsWith('/_next/image') ||
    pathname.startsWith('/auth') ||
    pathname.startsWith('/health') ||
    pathname.startsWith('/status') ||
    pathname.startsWith('/favicon') ||
    pathname === '/favicon.ico' ||
    pathname === '/terms' ||
    pathname === '/privacy'
  ) {
    return NextResponse.next();
  }

  // Delegate non-healthcheck routes to NextAuth's middleware
  return await auth(req as any, event);
}
