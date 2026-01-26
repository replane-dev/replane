import {defaultShouldDehydrateQuery, QueryClient} from '@tanstack/react-query';
import {toast} from 'sonner';
import superjson from 'superjson';

// Track when the tab became visible to suppress transient connection errors
// that occur when returning to an inactive tab. Browsers throttle network
// activity for background tabs, so initial fetches may fail briefly.
let lastVisibleTimestamp = Date.now();
const VISIBILITY_GRACE_PERIOD_MS = 5000; // Suppress network errors for 5s after tab becomes visible

if (typeof window !== 'undefined') {
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') {
      lastVisibleTimestamp = Date.now();
    }
  });
}

function isWithinVisibilityGracePeriod(): boolean {
  return Date.now() - lastVisibleTimestamp < VISIBILITY_GRACE_PERIOD_MS;
}

function isNetworkError(error: unknown): boolean {
  if (!error) return false;
  let raw: string | undefined;
  if (typeof error === 'string') raw = error;
  else if (error instanceof Error) raw = error.message;
  if (!raw) return false;
  const lower = raw.toLowerCase();
  return (
    lower.includes('failed to fetch') || lower.includes('network') || lower.includes('fetch error')
  );
}

export function makeQueryClient() {
  const qc = new QueryClient({
    defaultOptions: {
      queries: {
        // I'm not sure that it's safe to use cache because it might
        // result in an unpredictable app where you know that there
        // should be a new value for the config, but UI shows you the
        // previous value. I added an invalidation logic below that
        // should handle all such cases, but I'm not sure yet. That is
        // why I left the original query client settings commented out.

        // staleTime: 0, // immediately consider data stale
        // gcTime: 0, // remove from cache as soon as last observer unsubscribes
        // refetchOnMount: 'always',
        // refetchOnWindowFocus: 'always',
        // refetchOnReconnect: 'always',
        retry: false,
      },
      dehydrate: {
        serializeData: superjson.serialize,
        shouldDehydrateQuery: query =>
          defaultShouldDehydrateQuery(query) || query.state.status === 'pending',
      },
      hydrate: {
        deserializeData: superjson.deserialize,
      },
    },
  });

  // after any successful mutation, invalidate everything so next screen visit refetches.
  qc.getMutationCache().subscribe(event => {
    // In v5 react-query, mutation cache events don't emit a 'success' type; instead we look for
    // 'updated' events whose mutation state is success.
    if (event.type === 'updated' && event.mutation.state.status === 'success') {
      qc.invalidateQueries();
    }
    if (event.type === 'updated' && event.mutation.state.status === 'error') {
      if (typeof window !== 'undefined') {
        const msg = normalizeErrorMessage(event.mutation.state.error);
        toast.error(msg, {
          description: 'Please try again or contact support if the issue persists.',
        });
      }
    }
  });

  qc.getQueryCache().subscribe(event => {
    if (event.type === 'updated' && event.query.state.status === 'error') {
      if (typeof window !== 'undefined') {
        const error = event.query.state.error;
        // Suppress network errors briefly after tab becomes visible.
        // When users return to an inactive tab, browsers may briefly fail
        // network requests before reconnecting - no need to alarm them.
        if (isNetworkError(error) && isWithinVisibilityGracePeriod()) {
          return;
        }
        const msg = normalizeErrorMessage(error);
        toast.error(msg, {description: 'Please refresh the page or try again later.'});
      }
    }
  });

  return qc;
}

function normalizeErrorMessage(error: unknown): string {
  if (!error) return 'Something went wrong';

  let raw: string | undefined;
  if (typeof error === 'string') raw = error;
  else if (error instanceof Error) raw = error.message || 'Error';
  else {
    try {
      raw = JSON.stringify(error);
    } catch {
      raw = 'Error';
    }
  }

  if (!raw) return 'Something went wrong';
  const lower = raw.toLowerCase();

  // Heuristic mappings to user‑friendly messages
  if (
    lower.includes('not allowed') ||
    lower.includes('forbidden') ||
    lower.includes('permission')
  ) {
    return "You don't have permission to perform this action";
  }
  if (lower.includes('unauthorized') || lower.includes('not authenticated')) {
    return 'Your session has expired — please sign in again';
  }
  if (
    lower.includes('failed to fetch') ||
    lower.includes('network') ||
    lower.includes('fetch error')
  ) {
    return 'Connection issue — please check your internet and try again';
  }
  if (lower.includes('timeout')) {
    return 'The request took too long — please try again';
  }
  if (lower.includes('duplicate key') || lower.includes('unique constraint')) {
    return 'This item already exists';
  }
  if (lower.includes('does not exist') || lower.includes('not found')) {
    return 'The requested item could not be found';
  }
  if (lower.includes('validation') || lower.includes('invalid') || lower.includes('schema')) {
    return 'Please check your input and try again';
  }
  if (lower.includes('rate limit')) {
    return 'Too many requests — please wait a moment and try again';
  }
  if (lower.includes('serialization failure')) {
    return 'A conflict occurred — please refresh and try again';
  }

  // Default: trim and simplify long technical messages
  const concise = raw.trim().replace(/^[a-z0-9_-]+:\s*/i, '');
  return concise.length > 180 ? concise.slice(0, 177) + '…' : concise;
}
