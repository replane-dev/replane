import {withAuth} from 'next-auth/middleware';
import {NextResponse} from 'next/server';

// Custom middleware to return 200 {status:'ok'} for health check path
export default withAuth(async function middleware(req) {
  const envPath = process.env.HEALTH_CHECK_PATH;
  if (envPath) {
    const normalized = envPath.startsWith('/') ? envPath : `/${envPath}`;
    if (req.nextUrl.pathname === normalized) {
      return new Response(JSON.stringify({status: 'ok'}), {
        status: 200,
        headers: {'content-type': 'application/json'},
      });
    }
  }
  // For other paths, continue (auth handled by withAuth wrapper)
  return NextResponse.next();
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
