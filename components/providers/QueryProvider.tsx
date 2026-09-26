"use client";

import { useEffect, useState, type ReactNode } from "react";
import type { QueryClient } from "@tanstack/react-query";
import { PersistQueryClientProvider } from "@tanstack/react-query-persist-client";
import { ReactQueryDevtools } from "@tanstack/react-query-devtools";
import { useSession } from "next-auth/react";
import { shouldPersistQuery } from "@/lib/query/aiContentKeys";
import { makeQueryClient } from "@/lib/query/queryClient";
import { claimOfflineData, isConfirmedSignedOut, OFFLINE_CACHE_BUSTER, OFFLINE_MAX_AGE_MS, offlinePersister } from "@/lib/query/offlineStore";

/** Keeps the restored snapshot tied to the person it belongs to. */
function OfflineOwnerGuard({ client }: { client: QueryClient }) {
  const { data: session, status } = useSession();
  const email = session?.user?.email ?? null;
  useEffect(() => {
    if (status === "loading") return;
    if (status === "authenticated") {
      void claimOfflineData(client, email);
      return;
    }
    let cancelled = false;
    void isConfirmedSignedOut().then((signedOut) => {
      if (signedOut && !cancelled) void claimOfflineData(client, null);
    });
    return () => {
      cancelled = true;
    };
  }, [client, status, email]);
  return null;
}

export function QueryProvider({ children }: { children: ReactNode }) {
  const [client] = useState(makeQueryClient);
  return (
    <PersistQueryClientProvider
      client={client}
      persistOptions={{
        persister: offlinePersister,
        maxAge: OFFLINE_MAX_AGE_MS,
        buster: OFFLINE_CACHE_BUSTER,
        dehydrateOptions: { shouldDehydrateQuery: shouldPersistQuery },
      }}
    >
      <OfflineOwnerGuard client={client} />
      {children}
      <ReactQueryDevtools initialIsOpen={false} buttonPosition="bottom-left" />
    </PersistQueryClientProvider>
  );
}
