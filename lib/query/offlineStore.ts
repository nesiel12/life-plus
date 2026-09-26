"use client";

import { createAsyncStoragePersister } from "@tanstack/query-async-storage-persister";
import type { QueryClient } from "@tanstack/react-query";
import localforage from "localforage";

export const OFFLINE_MAX_AGE_MS = 1000 * 60 * 60 * 24 * 30;

// Bump when a persisted AI-content shape changes incompatibly: a mismatched
// buster makes the restore discard the old blob instead of rendering it.
export const OFFLINE_CACHE_BUSTER = "offline-v2";

const OWNER_KEY = "lifeplus.offlineOwner";

const store = localforage.createInstance({ name: "lifeplus", storeName: "query_cache" });

export const offlinePersister = createAsyncStoragePersister({
  storage: store,
  key: "lifeplus-react-query",
  throttleTime: 1000,
});

/** SHA-256 of the email — enough to tell "same person" without storing the address itself. */
async function ownerFingerprint(email: string): Promise<string> {
  const bytes = new TextEncoder().encode(email.trim().toLowerCase());
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return Array.from(new Uint8Array(digest), (b) => b.toString(16).padStart(2, "0")).join("");
}

/**
 * Wipes every trace of the signed-in person's offline data on this device:
 * the in-memory query cache, the IndexedDB snapshot, and the service
 * worker's page caches. Personal lessons must not outlive a sign-out on a
 * shared device.
 */
export async function clearOfflineData(queryClient: QueryClient): Promise<void> {
  queryClient.clear();
  try {
    localStorage.removeItem(OWNER_KEY);
  } catch {
    // storage blocked — nothing was stored either
  }
  await Promise.allSettled([
    store.clear(),
    // Runtime caches hold this person's rendered pages (HTML/RSC). The
    // precache is only build output — static JS/CSS, nothing personal — and
    // deleting it would leave the next person with no offline shell until
    // the next deploy reinstalls the worker.
    typeof caches === "undefined"
      ? Promise.resolve()
      : caches.keys().then((names) => Promise.all(names.filter((n) => !n.startsWith("serwist-precache")).map((n) => caches.delete(n)))),
  ]);
}

export type SessionProbe = "signed-in" | "signed-out" | "unreachable";

/**
 * Asks the server directly whether there is a session. next-auth's own
 * status can't answer this: it reports "unauthenticated" both when the
 * server says there is no session AND whenever it simply could not reach
 * /api/auth/session — i.e. every time the device is offline.
 */
export async function probeSession(): Promise<SessionProbe> {
  try {
    // Bounded: on a connection that hangs rather than fails, "no answer in
    // 5s" is treated as offline instead of stalling the shell indefinitely.
    const res = await fetch("/api/auth/session", { cache: "no-store", signal: AbortSignal.timeout(5000) });
    if (!res.ok) return "unreachable";
    const body = (await res.json()) as { user?: unknown } | null;
    return body?.user ? "signed-in" : "signed-out";
  } catch {
    return "unreachable";
  }
}

/**
 * Only a real answer from the server with no user counts as signed out.
 * Treating an unreachable server as a sign-out wiped the whole offline store
 * the moment the network dropped (live-caught).
 */
export async function isConfirmedSignedOut(): Promise<boolean> {
  return (await probeSession()) === "signed-out";
}

/**
 * Called once the session resolves. A snapshot restored from IndexedDB
 * belongs to whoever was signed in when it was written; if that is not the
 * current person (a sign-out that skipped clearOfflineData — an expired
 * session, cleared cookies), drop it before it can be read.
 */
export async function claimOfflineData(queryClient: QueryClient, email: string | null): Promise<void> {
  if (!email) {
    await clearOfflineData(queryClient);
    return;
  }
  const fingerprint = await ownerFingerprint(email);
  let previous: string | null = null;
  try {
    previous = localStorage.getItem(OWNER_KEY);
  } catch {
    return;
  }
  if (previous === fingerprint) return;
  if (previous !== null) await clearOfflineData(queryClient);
  try {
    localStorage.setItem(OWNER_KEY, fingerprint);
  } catch {
    // ignore
  }
}

/** A fetch that never reached the server (offline, DNS, connection refused) rejects with a TypeError. */
export const isNetworkFailure = (error: unknown) => error instanceof TypeError;
