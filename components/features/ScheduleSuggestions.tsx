"use client";

import { useEffect, useRef, useState } from "react";
import { motion } from "framer-motion";
import { Check, X, CalendarClock } from "lucide-react";
import { useAtlasStore, categoryLabel } from "@/store/useAtlasStore";
import { GlassCard } from "@/components/ui/GlassCard";
import { useApiCall } from "@/hooks/useApiCall";

function formatTimeRange(startISO: string, endISO: string): string {
  const fmt = (d: Date) => d.toLocaleTimeString("he-IL", { hour: "2-digit", minute: "2-digit" });
  return `${fmt(new Date(startISO))}–${fmt(new Date(endISO))}`;
}

export function ScheduleSuggestions() {
  const lifeAreas = useAtlasStore((s) => s.lifeAreas);
  const suggestions = useAtlasStore((s) => s.suggestedActions);
  const setSuggestedActions = useAtlasStore((s) => s.setSuggestedActions);
  const acceptSuggestion = useAtlasStore((s) => s.acceptSuggestion);
  const dismissSuggestion = useAtlasStore((s) => s.dismissSuggestion);
  const [connected, setConnected] = useState<boolean | null>(null);
  const { loading: accepting, error: acceptError, run: accept } = useApiCall(acceptSuggestion);
  const [acceptingId, setAcceptingId] = useState<string | null>(null);

  function handleAccept(id: string) {
    setAcceptingId(id);
    accept(id).catch(() => {
      // error is already captured in acceptError for display below
    });
  }

  // This fetch is deliberately mount-only — suggestions are computed once
  // per page load, not re-fetched on every score change. A ref (rather than
  // a `lifeAreas` dependency + eslint-disable, as before — see
  // docs/TECH_DEBT.md #16) keeps the effect honest about that intent while
  // still sending current scores, not a stale snapshot from first render.
  const lifeAreasRef = useRef(lifeAreas);
  lifeAreasRef.current = lifeAreas;

  useEffect(() => {
    let cancelled = false;
    fetch("/api/calendar/suggestions", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ lifeAreas: lifeAreasRef.current }),
    })
      .then((res) => res.json())
      .then((data) => {
        if (cancelled) return;
        setConnected(Boolean(data.connected));
        setSuggestedActions(data.suggestions ?? []);
      })
      .catch(() => {
        if (!cancelled) setConnected(false);
      });
    return () => {
      cancelled = true;
    };
  }, [setSuggestedActions]);

  if (connected === false) {
    return (
      <GlassCard delay={0.2}>
        <p className="mb-1 flex items-center gap-2 text-sm font-medium text-muted">
          <CalendarClock size={16} />
          הצעות מאטלס ללו״ז
        </p>
        <p className="text-xs text-muted">
          חבר יומן Google (דרך ההתחברות) כדי לקבל הצעות מבוססות זמן פנוי אמיתי.
        </p>
      </GlassCard>
    );
  }

  if (connected === true && suggestions.length === 0) return null;

  return (
    <GlassCard delay={0.2}>
      <p className="mb-4 flex items-center gap-2 text-sm font-medium text-muted">
        <CalendarClock size={16} />
        הצעות מאטלס ללו״ז
      </p>
      <ul className="flex flex-col gap-3">
        {suggestions.map((s, i) => (
          <motion.li
            key={s.id}
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.3, delay: i * 0.06 }}
            className="rounded-xl bg-white/5 p-3 text-sm"
          >
            <div className="mb-1 flex items-center justify-between">
              <span className="font-medium text-foreground">{s.title}</span>
              <span className="ltr text-xs text-muted">{formatTimeRange(s.start, s.end)}</span>
            </div>
            <p className="mb-2 text-xs text-foreground/70">{s.rationale}</p>
            <div className="flex items-center justify-between">
              <span className="text-xs text-muted">{categoryLabel(s.category)}</span>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => handleAccept(s.id)}
                  disabled={accepting}
                  className="flex items-center gap-1 rounded-lg bg-accent-health/15 px-2 py-1 text-xs text-accent-health disabled:opacity-40"
                >
                  <Check size={12} />
                  {accepting && acceptingId === s.id ? "יוצר ביומן…" : "אשר"}
                </button>
                <button
                  onClick={() => dismissSuggestion(s.id)}
                  disabled={accepting}
                  className="flex items-center gap-1 rounded-lg bg-white/5 px-2 py-1 text-xs text-muted disabled:opacity-40"
                >
                  <X size={12} />
                  התעלם
                </button>
              </div>
            </div>
            {acceptError && acceptingId === s.id && (
              <p className="mt-2 text-xs text-accent-family">{acceptError}</p>
            )}
          </motion.li>
        ))}
      </ul>
    </GlassCard>
  );
}
