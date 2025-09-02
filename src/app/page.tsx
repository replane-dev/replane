import {HydrateClient, prefetch, trpc} from '@/trpc/server';
import {Suspense} from 'react';
import {ErrorBoundary} from 'react-error-boundary';

export default function Home() {
  prefetch(trpc.hello.queryOptions({text: 'world'}));
  return (
    <HydrateClient>
      <ErrorBoundary fallback={<div>Something went wrong</div>}>
        <Suspense fallback={<div>Loading...</div>}>Empty (redirects to /app)</Suspense>
      </ErrorBoundary>
    </HydrateClient>
  );
}
