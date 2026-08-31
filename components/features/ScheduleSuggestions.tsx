"use client";

import { useEffect, useState } from "react";
import { motion } from "framer-motion";
import { Check, X, CalendarClock, Clock3 } from "lucide-react";
import { useAtlasStore, categoryLabel } from "@/store/useAtlasStore";
import { GlassCard } from "@/components/ui/GlassCard";
import { ConfidenceBar } from "@/components/ui/ConfidenceBar";
import { useApiCall } from "@/hooks/useApiCall";

function formatTimeRange(startISO: string, endISO: string): string {
  const fmt = (d: Date) => d.toLocaleTimeString("he-IL", { hour: "2-digit", minute: "2-digit" });
  return `${fmt(new Date(startISO))}–${fmt(new Date(endISO))}`;
}

// Real, derived from the slot Atlas already found — not an invented
// "effort" metric.
function formatDuration(startISO: string, endISO: string): string {
  const minutes = Math.round((new Date(endISO).getTime() - new Date(startISO).getTime()) / 60_000);
  if (minutes < 60) return `${minutes} דקות`;
  const hours = Math.round((minutes / 60) * 10) / 10;
  return `כ-${hours} שעות`;
}

export function ScheduleSuggestions() {
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

  // Mount-only — suggestions are computed once per page load. Life-area
  // scores used to come from the client's store (needing a ref workaround
  // to avoid re-fetching on every score change, see docs/TECH_DEBT.md #16);
  // the server now fetches its own canonical scores via the Context Engine
  // (docs/ATLAS_ARCHITECTURE_VISION.md §5), so there's nothing left to send.
  useEffect(() => {
    let cancelled = false;
    fetch("/api/calendar/suggestions", { method: "POST" })
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
          הצעות מ-Life Plus ללו״ז
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
        הצעות מ-Life Plus ללו״ז
      </p>
      <ul className="flex flex-col gap-4">
        {suggestions.map((s, i) => (
          <motion.li
            key={s.id}
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.3, delay: i * 0.06, ease: "easeOut" }}
            className="rounded-xl bg-white/5 p-4 text-sm"
          >
            <div className="mb-1 flex items-center justify-between">
              <span className="font-medium text-foreground">{s.title}</span>
              <span className="ltr text-xs text-muted">{formatTimeRange(s.start, s.end)}</span>
            </div>

            <div className="mb-2 flex items-center gap-2 text-xs text-muted">
              <span>{categoryLabel(s.category)}</span>
              <span aria-hidden>·</span>
              <span className="flex items-center gap-1">
                <Clock3 size={11} aria-hidden />
                {formatDuration(s.start, s.end)}
              </span>
            </div>

            <p className="mb-3 text-xs leading-relaxed text-foreground/70">{s.rationale}</p>

            <ConfidenceBar
              value={s.confidence}
              ariaLabel="רמת התאמה של ההצעה"
              barColorClass="bg-accent-health"
              className="mb-3"
            />

            <div className="flex items-center justify-end gap-2">
              <button
                onClick={() => handleAccept(s.id)}
                disabled={accepting}
                className="flex items-center gap-1 rounded-lg bg-accent-health/15 px-3 py-1.5 text-xs font-medium text-accent-health transition-opacity disabled:opacity-40"
              >
                <Check size={12} />
                {accepting && acceptingId === s.id ? "יוצר ביומן…" : "אשר"}
              </button>
              <button
                onClick={() => dismissSuggestion(s.id)}
                disabled={accepting}
                className="flex items-center gap-1 rounded-lg bg-white/5 px-3 py-1.5 text-xs text-muted transition-opacity hover:text-foreground disabled:opacity-40"
              >
                <X size={12} />
                התעלם
              </button>
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
