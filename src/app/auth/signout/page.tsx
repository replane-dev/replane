import {getAuthOptions} from '@/app/auth-options';
import {ReplaneIcon} from '@/components/replane-icon';
import {Button} from '@/components/ui/button';
import {Card, CardContent, CardDescription, CardHeader, CardTitle} from '@/components/ui/card';
import {LogOut} from 'lucide-react';
import {getServerSession} from 'next-auth';
import Link from 'next/link';
import {redirect} from 'next/navigation';

export const dynamic = 'force-dynamic';

interface SignOutPageProps {
  searchParams: Promise<{
    callbackUrl?: string;
  }>;
}

export default async function SignOutPage({searchParams}: SignOutPageProps) {
  const session = await getServerSession(getAuthOptions());
  const params = await searchParams;

  // If not signed in, redirect to sign in page
  if (!session) {
    redirect('/auth/signin');
  }

  return (
    <div className="bg-muted flex min-h-svh flex-col items-center justify-center gap-6 p-6 md:p-10">
      <div className="flex w-full max-w-sm flex-col gap-6">
        <Link href="/" className="flex items-center gap-2 self-center font-medium">
          <div className="bg-primary text-primary-foreground flex size-6 items-center justify-center rounded-md">
            <ReplaneIcon className="size-4" />
          </div>
          Replane
        </Link>

        <Card>
          <CardHeader className="text-center">
            <CardTitle className="text-xl">Sign Out</CardTitle>
            <CardDescription>Are you sure you want to sign out?</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="flex flex-col gap-6">
              <div className="rounded-lg border bg-muted/30 p-3">
                <p className="text-sm text-muted-foreground">Signed in as</p>
                <p className="mt-1 font-medium">{session.user?.email}</p>
              </div>

              <div className="flex flex-col gap-2">
                <form action="/api/auth/signout" method="POST">
                  <input
                    type="hidden"
                    name="callbackUrl"
                    value={params.callbackUrl || '/auth/signin'}
                  />
                  <Button type="submit" variant="destructive" className="w-full">
                    <LogOut />
                    Sign Out
                  </Button>
                </form>
                <Button asChild variant="outline">
                  <a href={params.callbackUrl || '/app'}>Cancel</a>
                </Button>
              </div>

              <p className="text-muted-foreground text-center text-xs">
                You can sign back in anytime
              </p>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
