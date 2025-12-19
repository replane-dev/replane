'use client';

import {SignInForm} from '@/components/auth/sign-in-form';
import {ReplaneIcon} from '@/components/replane-icon';
import {useTRPC} from '@/trpc/client';
import {useSuspenseQuery} from '@tanstack/react-query';
import {useSession} from 'next-auth/react';
import Link from 'next/link';
import {redirect, useSearchParams} from 'next/navigation';

export default function SignInPage() {
  const params = useSearchParams();
  const callbackUrl = params.get('callbackUrl') ?? '/app';
  const {data: session} = useSession();
  const trpc = useTRPC();
  const {data} = useSuspenseQuery(trpc.getAuthProviders.queryOptions());

  // If already signed in, redirect to callback URL or home
  if (session) {
    redirect(callbackUrl);
  }

  // If no users exist, redirect to signup page for initial setup
  if (!data.hasUsers) {
    redirect(`/auth/signup?callbackUrl=${encodeURIComponent(callbackUrl)}`);
  }

  const providers = data.providers;
  const allowedEmailDomains = data.allowedEmailDomains;
  const passwordAuthEnabled = data.passwordAuthEnabled;

  const errorMessages: Record<string, string> = {
    OAuthSignin: 'Error constructing authorization URL.',
    OAuthCallback: 'Error handling OAuth callback.',
    OAuthCreateAccount: 'Could not create OAuth provider account.',
    EmailCreateAccount: 'Could not create email provider account.',
    Callback: 'Error in callback handler.',
    OAuthAccountNotLinked: 'This account is not linked. Please sign in with the original account.',
    EmailSignin: 'Unable to send sign-in email. Please check your email address and try again.',
    CredentialsSignin: 'Sign in failed. Check the details you provided are correct.',
    SessionRequired: 'Please sign in to access this page.',
    default: 'Unable to sign in.',
  };

  const error = params.get('error');
  const errorMessage = error ? errorMessages[error] || errorMessages.default : null;

  return (
    <div className="bg-sidebar flex min-h-svh flex-col items-center justify-center gap-6 p-6 md:p-10">
      <div className="flex w-full max-w-sm flex-col gap-6">
        <div className="flex flex-col gap-2 text-center">
          <Link href="/" className="flex items-center gap-2 self-center font-medium">
            <div className="bg-primary text-primary-foreground flex size-6 items-center justify-center rounded-md">
              <ReplaneIcon className="size-4" />
            </div>
            Replane
          </Link>
          <p className="text-muted-foreground text-sm">
            Dynamic configuration for apps and services
          </p>
        </div>
        <SignInForm
          providers={providers}
          callbackUrl={callbackUrl}
          error={errorMessage}
          allowedEmailDomains={allowedEmailDomains}
          passwordAuthEnabled={passwordAuthEnabled}
        />
        <div className="text-muted-foreground text-balance text-center text-xs">
          By clicking continue, you agree to our{' '}
          <a href="/terms" className="underline underline-offset-4 hover:text-foreground">
            Terms of Service
          </a>{' '}
          and{' '}
          <a href="/privacy" className="underline underline-offset-4 hover:text-foreground">
            Privacy Policy
          </a>
          .
        </div>
      </div>
    </div>
  );
}
