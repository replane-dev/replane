'use client';

import {SignUpForm} from '@/components/auth/sign-up-form';
import {ReplaneIcon} from '@/components/replane-icon';
import {useTRPC} from '@/trpc/client';
import {useSuspenseQuery} from '@tanstack/react-query';
import {useSession} from 'next-auth/react';
import Link from 'next/link';
import {redirect, useSearchParams} from 'next/navigation';

export const NO_SIGNUP_REDIRECT_PARAM = 'no-signup-redirect';
export const NO_SIGNUP_REDIRECT_VALUE = 'true';

export default function SignUpPage() {
  const params = useSearchParams();
  const callbackUrl = params.get('callbackUrl') ?? '/app';
  const {data: session} = useSession();
  const trpc = useTRPC();
  const {data} = useSuspenseQuery(trpc.getAuthProviders.queryOptions());

  // If already signed in, redirect to callback URL or home
  if (session) {
    redirect(callbackUrl);
  }

  if (!data.passwordAuthEnabled) {
    redirect(
      `/auth/signin?${NO_SIGNUP_REDIRECT_PARAM}=${NO_SIGNUP_REDIRECT_VALUE}&callbackUrl=${encodeURIComponent(callbackUrl)}`,
    );
  }

  const allowedEmailDomains = data.allowedEmailDomains;

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
        <SignUpForm callbackUrl={callbackUrl} allowedEmailDomains={allowedEmailDomains} />
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
