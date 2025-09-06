import {defaultShouldDehydrateQuery, QueryClient} from '@tanstack/react-query';
import {toast} from 'sonner';
import superjson from 'superjson';

export function makeQueryClient() {
  const qc = new QueryClient({
    defaultOptions: {
      queries: {
        // Always consider data immediately stale and drop it once unused
        staleTime: 0,
        gcTime: 0, // remove from cache as soon as last observer unsubscribes
        refetchOnMount: 'always',
        refetchOnWindowFocus: 'always',
        refetchOnReconnect: 'always',
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
        toast.error(msg, {description: 'Something went wrong. Please try again.'});
      }
    }
  });

  qc.getQueryCache().subscribe(event => {
    if (event.type === 'updated' && event.query.state.status === 'error') {
      if (typeof window !== 'undefined') {
        const msg = normalizeErrorMessage(event.query.state.error);
        toast.error(msg, {description: "We couldn't load the data. Please retry."});
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
    return "You don't have permission for that.";
  }
  if (lower.includes('unauthorized') || lower.includes('not authenticated')) {
    return 'Please sign in to continue.';
  }
  if (
    lower.includes('failed to fetch') ||
    lower.includes('network') ||
    lower.includes('fetch error')
  ) {
    return 'Network error. Check your connection and try again.';
  }
  if (lower.includes('timeout')) {
    return 'The request timed out. Try again.';
  }
  if (lower.includes('duplicate key') || lower.includes('unique constraint')) {
    return 'Resource already exists.';
  }
  if (lower.includes('does not exist') || lower.includes('not found')) {
    return 'The requested resource was not found.';
  }
  if (lower.includes('validation') || lower.includes('invalid') || lower.includes('schema')) {
    return 'Input is invalid. Please review and try again.';
  }
  if (lower.includes('rate limit')) {
    return 'Too many requests. Please slow down.';
  }
  if (lower.includes('serialization failure')) {
    return 'Concurrent update conflict. Please retry.';
  }

  // Default: trim and simplify long technical messages
  const concise = raw.trim().replace(/^[a-z0-9_-]+:\s*/i, '');
  return concise.length > 180 ? concise.slice(0, 177) + '…' : concise;
}
