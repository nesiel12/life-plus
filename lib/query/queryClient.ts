import { QueryClient } from "@tanstack/react-query";

export function makeQueryClient(): QueryClient {
  return new QueryClient({
    defaultOptions: {
      queries: {
        // Infinity, NOT the 30-day persistence window: React Query arms a
        // setTimeout for gcTime, and any delay above 2^31-1 ms (~24.8 days)
        // overflows to ~0 — every unobserved query (a hover prefetch, a
        // finished lesson) was collected instantly and never persisted.
        // Expiry is the persister's maxAge (lib/query/offlineStore.ts).
        gcTime: Infinity,
        staleTime: Infinity,
        // Try the network once even when the browser reports offline, then
        // fail — the default "online" mode would park the request forever
        // and leave a spinner where an honest "you're offline" belongs.
        networkMode: "offlineFirst",
        retry: 1,
        refetchOnWindowFocus: false,
      },
    },
  });
}
