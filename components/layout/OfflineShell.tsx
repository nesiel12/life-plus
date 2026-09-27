"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { Wifi, WifiOff } from "lucide-react";
import { useSerwist } from "@serwist/turbopack/react";
import { useAtlasStore, type AtlasState } from "@/store/useAtlasStore";
import type { HydratedState } from "@/store/useAtlasStore";
import { offlineBootstrapQueryKey, type OfflineBootstrapSnapshot } from "@/lib/query/offlineKeys";
import { probeSession } from "@/lib/query/offlineStore";

// Only these fields — exactly HydratedState, the shape getInitialState()
// returns and hydrate() applies — ever leave the store for the offline
// snapshot. A literal field-by-field copy (not a spread of the whole store)
// so the compiler itself catches a future HydratedState field this forgets:
// leaving one out here is a type error, not a silent gap discovered only
// once someone is offline.
function pickHydratedState(full: AtlasState): HydratedState {
  return {
    user: full.user,
    lifeAreas: full.lifeAreas,
    people: full.people,
    moments: full.moments,
    upcomingEvents: full.upcomingEvents,
    knowledgeEntries: full.knowledgeEntries,
    chatHistory: full.chatHistory,
    insights: full.insights,
    personalDNA: full.personalDNA,
    onboardingComplete: full.onboardingComplete,
    goals: full.goals,
    todayIntention: full.todayIntention,
    books: full.books,
    rabbis: full.rabbis,
    summaries: full.summaries,
    summarySections: full.summarySections,
    checkIns: full.checkIns,
    tasks: full.tasks,
    habits: full.habits,
    habitLogs: full.habitLogs,
    transactions: full.transactions,
    manualEvents: full.manualEvents,
    learningTopics: full.learningTopics,
    learningResources: full.learningResources,
    meals: full.meals,
    workouts: full.workouts,
    routineBlocks: full.routineBlocks,
    notifications: full.notifications,
    notificationUnreadCount: full.notificationUnreadCount,
  };
}

const PERSIST_THROTTLE_MS = 4000;

/**
 * Online and fully hydrated: keeps a read-only, device-local snapshot of the
 * ENTIRE bootstrap (every domain — calendar, finances, family, not just
 * learning) current, so an offline cold start can open into the real app
 * instead of the old empty "no connection" screen. Also asks the service
 * worker to keep the pages an offline start could land on.
 *
 * Subscribes to the store directly (zustand's own subscribe, not a React
 * selector) rather than re-rendering this component on every one of ~30
 * fields changing — most of which (a streaming chat token, a recommendation
 * cache) have nothing to do with what needs saving. Throttled: a snapshot
 * this fresh only matters once the person is actually offline, not on every
 * keystroke while they're online and the real data is one request away.
 */
export function OfflineBootstrapPersister() {
  const queryClient = useQueryClient();
  const { serwist } = useSerwist();
  const warmed = useRef(false);
  const pending = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    const persist = () => {
      pending.current = null;
      const state = pickHydratedState(useAtlasStore.getState());
      queryClient.setQueryData<OfflineBootstrapSnapshot>(offlineBootstrapQueryKey, { state, savedAt: new Date().toISOString() });
    };
    persist(); // an immediate snapshot on mount/hydrate, not just on the next change
    const unsubscribe = useAtlasStore.subscribe(() => {
      if (pending.current) return;
      pending.current = setTimeout(persist, PERSIST_THROTTLE_MS);
    });
    return () => {
      unsubscribe();
      if (pending.current) clearTimeout(pending.current);
    };
  }, [queryClient]);

  useEffect(() => {
    if (!serwist || warmed.current) return;
    warmed.current = true;
    // Every top-level destination (Sidebar/MobileTabBar's own NAV_ITEMS,
    // plus "/" — the installed app's start_url) — warmed once the shell
    // exists, so a fresh offline navigation (typing the URL, a bookmark, a
    // PWA icon tap) to a route never actually visited this session still
    // gets the real app shell instead of the generic ~offline fallback,
    // which only ever covers a route genuinely never cached on any device.
    void serwist.messageSW({
      type: "CACHE_URLS",
      payload: {
        urlsToCache: [
          "/",
          "/calendar",
          "/areas/learning",
          "/areas/torah",
          "/areas/family",
          "/areas/health",
          "/areas/finances",
          "/areas/recovery",
          "/timeline",
          "/settings",
        ],
      },
    });
  }, [serwist]);

  return null;
}

export function OfflineBanner({ savedAt }: { savedAt: string | undefined }) {
  const [phase, setPhase] = useState<"offline" | "checking" | "still-offline" | "back">("offline");

  const check = useCallback(async () => {
    setPhase("checking");
    const probe = await probeSession();
    if (probe === "unreachable") setPhase("still-offline");
    // Reachable: a fresh load runs the normal online start (session +
    // bootstrap) — next-auth offers no in-place way to leave
    // "unauthenticated" once its first session fetch failed.
    else window.location.reload();
  }, []);

  // Coming back online never reloads on its own — that would throw away
  // whatever the person is doing mid-read. It only offers to.
  useEffect(() => {
    const onOnline = () => void probeSession().then((p) => p !== "unreachable" && setPhase("back"));
    window.addEventListener("online", onOnline);
    return () => window.removeEventListener("online", onOnline);
  }, []);

  const when = savedAt ? new Date(savedAt).toLocaleString("he-IL", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" }) : null;
  const message =
    phase === "back"
      ? "החיבור חזר."
      : `אין חיבור — מוצג המידע השמור במכשיר${when ? ` (עודכן ${when})` : ""}. פעולות חדשות יתבצעו כשהחיבור יחזור.${phase === "still-offline" ? " עדיין אין חיבור." : ""}`;

  return (
    <div role="status" className="mx-6 mb-4 mt-6 flex flex-wrap items-center gap-x-3 gap-y-1 rounded-xl border border-glass-border bg-fill-subtle px-4 py-2.5 text-xs text-muted sm:mx-10 lg:mx-16">
      {phase === "back" ? <Wifi size={14} aria-hidden className="shrink-0" /> : <WifiOff size={14} aria-hidden className="shrink-0" />}
      <span className="flex-1">{message}</span>
      <button
        type="button"
        onClick={() => (phase === "back" ? window.location.reload() : void check())}
        disabled={phase === "checking"}
        className="focus-ring rounded-lg px-2 py-1 font-medium text-foreground hover:bg-fill-subtle disabled:opacity-60"
      >
        {phase === "back" ? "טען את כל הנתונים" : phase === "checking" ? "בודק…" : "נסה להתחבר"}
      </button>
    </div>
  );
}
