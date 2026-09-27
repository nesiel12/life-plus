"use client";

import { useEffect, useState, useSyncExternalStore, type ReactNode } from "react";
import dynamic from "next/dynamic";
import type { QueryClient } from "@tanstack/react-query";
import { PersistQueryClientProvider } from "@tanstack/react-query-persist-client";
import { useSession } from "next-auth/react";
import { shouldPersistQuery } from "@/lib/query/offlineKeys";
import { makeQueryClient } from "@/lib/query/queryClient";
import { claimOfflineData, isConfirmedSignedOut, OFFLINE_CACHE_BUSTER, OFFLINE_MAX_AGE_MS, offlinePersister } from "@/lib/query/offlineStore";

// Development only (the package already renders nothing in production; the
// explicit gate plus a lazy chunk also keeps it out of the production bundle),
// and only at sm: width and up. On the dev server its floating toggle sat on
// top of MobileTabBar's "עוד" tab, so tapping "עוד" opened the devtools
// instead of the sheet — and at phone width any other corner covers real UI.
const ReactQueryDevtools = dynamic(() => import("@tanstack/react-query-devtools").then((m) => m.ReactQueryDevtools), { ssr: false });

const WIDE_QUERY = "(min-width: 640px)";
function useIsWide(): boolean {
  return useSyncExternalStore(
    (onChange) => {
      const mql = window.matchMedia(WIDE_QUERY);
      mql.addEventListener("change", onChange);
      return () => mql.removeEventListener("change", onChange);
    },
    () => window.matchMedia(WIDE_QUERY).matches,
    () => false
  );
}

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
  const isWide = useIsWide();
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
      {process.env.NODE_ENV === "development" && isWide && <ReactQueryDevtools initialIsOpen={false} buttonPosition="bottom-left" />}
    </PersistQueryClientProvider>
  );
}
