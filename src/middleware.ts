import {withAuth} from 'next-auth/middleware';

export default withAuth({});

export const config = {
  matcher: [
    /*
     * Apply middleware to all paths except:
     * - API routes (starting with /api)
     * - Next.js static assets (starting with /_next/static)
     * - Next.js image optimization files (starting with /_next/image)
     * - The favicon file (/favicon.ico)
     */
    '/((?!api|login|_next/static|_next/image|favicon.ico).*)',
  ],
};
