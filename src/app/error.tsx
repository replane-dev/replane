'use client';

import * as Sentry from '@sentry/nextjs';
import {useEffect} from 'react';
import {Button} from '@/components/ui/button';

export default function Error({
  error,
  reset,
}: {
  error: Error & {digest?: string};
  reset: () => void;
}) {
  useEffect(() => {
    // Report to Sentry if enabled
    if (process.env.NEXT_PUBLIC_SENTRY_DSN) {
      Sentry.captureException(error);
    }
  }, [error]);

  return (
    <div className="flex flex-col items-center justify-center min-h-[50vh] p-8">
      <h1 className="text-2xl font-semibold mb-4">Something went wrong!</h1>
      <p className="text-muted-foreground mb-6 text-center max-w-md">
        An unexpected error occurred. Our team has been notified and is working to fix it.
      </p>
      <Button onClick={reset}>Try again</Button>
    </div>
  );
}

