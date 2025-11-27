import {Button} from '@/components/ui/button';
import {ArrowLeft, ShieldAlert} from 'lucide-react';
import Link from 'next/link';

export default function AuthNotFound() {
  return (
    <div className="min-h-screen w-full flex items-center justify-center bg-background p-4">
      <div className="max-w-md w-full text-center space-y-6">
        <div className="flex justify-center">
          <ShieldAlert className="h-20 w-20 text-destructive/60" strokeWidth={1.5} />
        </div>

        <div className="space-y-2">
          <h1 className="text-2xl font-bold tracking-tight">Authentication Page Not Found</h1>
          <p className="text-muted-foreground">
            The authentication page you&apos;re looking for doesn&apos;t exist.
          </p>
        </div>

        <div className="flex flex-col gap-3">
          <Button asChild size="lg">
            <Link href="/auth/signin">
              <ArrowLeft className="mr-2 h-4 w-4" />
              Back to Sign In
            </Link>
          </Button>
          <Button asChild variant="outline" size="lg">
            <Link href="/">Go to Homepage</Link>
          </Button>
        </div>

        <div className="pt-6 text-sm text-muted-foreground">
          <p>Available authentication pages:</p>
          <div className="mt-2 space-x-4">
            <Link href="/auth/signin" className="text-primary hover:underline">
              Sign In
            </Link>
            <Link href="/auth/signout" className="text-primary hover:underline">
              Sign Out
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}
