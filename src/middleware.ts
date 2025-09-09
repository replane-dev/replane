import {withAuth} from 'next-auth/middleware';
import {NextResponse} from 'next/server';

setInterval(
  () => {
    console.log('heartbeat', {ts: new Date().toISOString()});
  },
  5 * 60 * 1000,
).unref();

// Custom middleware to return 200 {status:'ok'} for health check path
export default withAuth(async function middleware(req) {
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

  const envPath = process.env.HEALTH_CHECK_PATH;
  if (envPath) {
    const normalized = envPath.startsWith('/') ? envPath : `/${envPath}`;
    if (pathname === normalized) {
      const res = new Response(JSON.stringify({status: 'ok'}), {
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

  const res = NextResponse.next();
  console.info(
    JSON.stringify({
      ts: new Date().toISOString(),
      msg: 'middleware_response',
      method: req.method,
      pathname,
      status: res.status,
    }),
  );
  return res;
}, {});

export const config = {
  matcher: [
    /*
     * Apply middleware to all paths except:
     * - API routes (starting with /api)
     * - Next.js static assets (starting with /_next/static)
     * - Next.js image optimization files (starting with /_next/image)
     * - The favicon file (/favicon.ico)
     */
    '/((?!api|_next/static|_next/image|favicon.ico).*)',
  ],
};
