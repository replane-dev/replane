import {getAuthOptions} from '@/app/auth-options';
import NextAuth from 'next-auth';

export const dynamic = 'force-dynamic';
export const revalidate = 0;
export const fetchCache = 'force-no-store';
export const runtime = 'nodejs';

export function GET(req: Request, ctx: any) {
	return NextAuth(getAuthOptions())(req, ctx);
}

export function POST(req: Request, ctx: any) {
	return NextAuth(getAuthOptions())(req, ctx);
}
