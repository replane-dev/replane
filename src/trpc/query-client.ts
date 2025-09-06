import {defaultShouldDehydrateQuery, QueryClient} from '@tanstack/react-query';
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
  });

  return qc;
}
