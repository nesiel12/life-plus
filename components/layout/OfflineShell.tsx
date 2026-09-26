"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import dynamic from "next/dynamic";
import { useQueryClient } from "@tanstack/react-query";
import { Wifi, WifiOff } from "lucide-react";
import { useSerwist } from "@serwist/turbopack/react";
import { useAtlasStore } from "@/store/useAtlasStore";
import { learningIndexQueryKey, type LearningIndexSnapshot } from "@/lib/query/offlineKeys";
import { isLearningRoute } from "@/lib/learning/offlineSnapshot";
import { probeSession } from "@/lib/query/offlineStore";

// Loaded only on an offline cold start away from the learning hub; its chunk
// is in the service worker's precache, so it resolves with no network.
const LearningHub = dynamic(() => import("@/components/features/learning/LearningHub").then((m) => m.LearningHub), { ssr: false });

/**
 * Online and fully hydrated: keeps the device's copy of the learning index
 * current (topics + steps — what an offline cold start needs to reach the
 * saved lessons), and asks the service worker to keep the pages an offline
 * start lands on. A separate component so learning edits re-render only this,
 * not the whole shell.
 */
export function LearningIndexPersister() {
  const queryClient = useQueryClient();
  const topics = useAtlasStore((s) => s.learningTopics);
  const resources = useAtlasStore((s) => s.learningResources);
  const { serwist } = useSerwist();
  const warmed = useRef(false);

  useEffect(() => {
    queryClient.setQueryData<LearningIndexSnapshot>(learningIndexQueryKey, { topics, resources, savedAt: new Date().toISOString() });
  }, [queryClient, topics, resources]);

  useEffect(() => {
    if (!serwist || warmed.current) return;
    warmed.current = true;
    // "/" is the installed app's start_url; the hub is where saved lessons live.
    void serwist.messageSW({ type: "CACHE_URLS", payload: { urlsToCache: ["/", "/areas/learning"] } });
  }, [serwist]);

  return null;
}

function OfflineBanner({ savedAt }: { savedAt: string | undefined }) {
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

  // Coming back online never reloads on its own — that would throw away a
  // lesson mid-read. It only offers to.
  useEffect(() => {
    const onOnline = () => void probeSession().then((p) => p !== "unreachable" && setPhase("back"));
    window.addEventListener("online", onOnline);
    return () => window.removeEventListener("online", onOnline);
  }, []);

  const when = savedAt ? new Date(savedAt).toLocaleString("he-IL", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" }) : null;
  const message =
    phase === "back"
      ? "החיבור חזר."
      : `אין חיבור — מוצגים הנושאים והשיעורים השמורים במכשיר${when ? ` (עודכנו ${when})` : ""}. שיעור שעוד לא נפתח ייווצר כשהחיבור יחזור.${phase === "still-offline" ? " עדיין אין חיבור." : ""}`;

  return (
    <div role="status" className="mb-4 flex flex-wrap items-center gap-x-3 gap-y-1 rounded-xl border border-glass-border bg-fill-subtle px-4 py-2.5 text-xs text-muted">
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

/**
 * The page area during an offline cold start. The learning routes render
 * as-is (their data came from the snapshot); any other route — including
 * "/", where an installed app opens — shows the saved learning hub instead
 * of that page's empty, never-loaded data.
 */
export function OfflineContent({ pathname, children }: { pathname: string; children: React.ReactNode }) {
  const queryClient = useQueryClient();
  const savedAt = queryClient.getQueryData<LearningIndexSnapshot>(learningIndexQueryKey)?.savedAt;
  return (
    <div className={isLearningRoute(pathname) ? undefined : "px-6 py-16 sm:px-10 lg:px-16"}>
      {isLearningRoute(pathname) ? (
        <div className="px-6 pt-6 sm:px-10 lg:px-16">
          <OfflineBanner savedAt={savedAt} />
        </div>
      ) : (
        <OfflineBanner savedAt={savedAt} />
      )}
      {isLearningRoute(pathname) ? children : <LearningHub />}
    </div>
  );
}
