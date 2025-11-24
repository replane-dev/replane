import {ReplaneIcon} from '@/components/replane-icon';
import {Button} from '@/components/ui/button';
import {Card, CardContent, CardDescription, CardHeader, CardTitle} from '@/components/ui/card';
import {AlertCircle} from 'lucide-react';
import Link from 'next/link';

export const dynamic = 'force-dynamic';

interface ErrorPageProps {
  searchParams: Promise<{
    error?: string;
  }>;
}

export default async function AuthErrorPage({searchParams}: ErrorPageProps) {
  const params = await searchParams;

  const errorMessages: Record<string, {title: string; description: string}> = {
    Configuration: {
      title: 'Server Configuration Error',
      description:
        'There is a problem with the server configuration. Please contact your administrator.',
    },
    AccessDenied: {
      title: 'Access Denied',
      description: 'You do not have permission to sign in.',
    },
    Verification: {
      title: 'Verification Failed',
      description: 'The verification token has expired or has already been used.',
    },
    OAuthSignin: {
      title: 'OAuth Sign In Error',
      description: 'Error constructing authorization URL. Please try again.',
    },
    OAuthCallback: {
      title: 'OAuth Callback Error',
      description: 'Error handling OAuth callback. Please try again.',
    },
    OAuthCreateAccount: {
      title: 'Account Creation Failed',
      description: 'Could not create OAuth provider account. Please try again.',
    },
    EmailCreateAccount: {
      title: 'Account Creation Failed',
      description: 'Could not create email provider account. Please try again.',
    },
    Callback: {
      title: 'Callback Error',
      description: 'Error in callback handler. Please try again.',
    },
    OAuthAccountNotLinked: {
      title: 'Account Not Linked',
      description: 'To confirm your identity, sign in with the same account you used originally.',
    },
    EmailSignin: {
      title: 'Email Sign In Failed',
      description: 'Failed to send sign in email. Please try again.',
    },
    CredentialsSignin: {
      title: 'Sign In Failed',
      description: 'Sign in failed. Check the details you provided are correct.',
    },
    SessionRequired: {
      title: 'Authentication Required',
      description: 'Please sign in to access this page.',
    },
    default: {
      title: 'Sign In Error',
      description: 'An error occurred during sign in. Please try again.',
    },
  };

  const error = params.error || 'default';
  const errorInfo = errorMessages[error] || errorMessages.default;

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
            <div className="mb-2 flex justify-center">
              <div className="bg-destructive/10 text-destructive flex size-12 items-center justify-center rounded-full">
                <AlertCircle className="size-6" />
              </div>
            </div>
            <CardTitle className="text-xl">{errorInfo.title}</CardTitle>
            <CardDescription className="text-balance">{errorInfo.description}</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="flex flex-col gap-2">
              <Button asChild>
                <Link href="/auth/signin">Try Again</Link>
              </Button>
              <Button asChild variant="outline">
                <Link href="/">Go Home</Link>
              </Button>
            </div>

            {process.env.NODE_ENV === 'development' && (
              <div className="mt-4 rounded-lg border bg-muted/30 p-3 text-xs">
                <p className="font-mono text-muted-foreground">Error Code: {error}</p>
              </div>
            )}
          </CardContent>
        </Card>

        <div className="text-muted-foreground text-center text-xs">
          Need help?{' '}
          <a href="#" className="underline underline-offset-4 hover:text-foreground">
            Contact support
          </a>
        </div>
      </div>
    </div>
  );
}
