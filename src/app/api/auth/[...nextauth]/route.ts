import {getAuthOptions} from '@/app/auth-options';
import NextAuth from 'next-auth';

export const dynamic = 'force-dynamic';
export const revalidate = 0;
export const fetchCache = 'force-no-store';
export const runtime = 'nodejs';

async function handleAuth(req: Request, ctx: any) {
  const res: Response = await NextAuth(getAuthOptions())(req, ctx);

  // bots probe auth endpoint with an incorrect callbackUrl, this downgrades the error
  // from a 500 to a 400 so it doesn't get counted as a server error
  if (res.status === 500) {
    const text = await res.clone().text();
    if (text.includes('There is a problem with the server configuration.')) {
      return new Response(text, {status: 400, headers: res.headers});
    }
  }

  return res;
}

export const GET = handleAuth;
export const POST = handleAuth;
