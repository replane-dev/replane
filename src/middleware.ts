import {withAuth} from 'next-auth/middleware';
import {NextResponse} from 'next/server';

// Auth middleware instance for non-healthcheck routes
const auth = withAuth({});

// Custom middleware to return 200 {status:'ok'} for health check path and bypass auth
export default async function middleware(req: any, event: any) {
  // Basic request logging
  const {pathname, search} = req.nextUrl;
  const ua = req.headers.get('user-agent') || '';
  const ip =
    (req as any).ip || req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || undefined;
  console.info(
    JSON.stringify({
      ts: new Date().toISOString(),
      msg: 'middleware_request',
      method: req.method,
      pathname,
      search,
      ip,
      ua,
    }),
  );

  const envPath = process.env.HEALTHCHECK_PATH;
  if (envPath) {
    const normalized = envPath.startsWith('/') ? envPath : `/${envPath}`;
    if (pathname === normalized) {
      const res = new Response(JSON.stringify({}), {
        status: 200,
        headers: {'content-type': 'application/json'},
      });
      console.info(
        JSON.stringify({
          ts: new Date().toISOString(),
          msg: 'middleware_healthcheck_ok',
          method: req.method,
          pathname,
          status: 200,
        }),
      );
      return res;
    }
  }

  // Apply internal matcher logic: bypass auth for excluded paths
  const isExcluded =
    pathname.startsWith('/api') ||
    pathname.startsWith('/_next/static') ||
    pathname.startsWith('/_next/image') ||
    pathname === '/favicon.ico';
  if (isExcluded) {
    const res = NextResponse.next();
    console.info(
      JSON.stringify({
        ts: new Date().toISOString(),
        msg: 'middleware_passthrough',
        method: req.method,
        pathname,
        status: res.status,
      }),
    );
    return res;
  }

  // Delegate non-healthcheck routes to NextAuth's middleware
  const res = await auth(req as any, event as any);
  console.info(
    JSON.stringify({
      ts: new Date().toISOString(),
      msg: 'middleware_response',
      method: req.method,
      pathname,
      status: res?.status ?? 200,
    }),
  );
  return res;
}
