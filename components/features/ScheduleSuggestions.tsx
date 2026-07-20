"use client";

import { useEffect, useState } from "react";
import { motion } from "framer-motion";
import { Check, X, CalendarClock } from "lucide-react";
import { useAtlasStore, categoryLabel } from "@/store/useAtlasStore";
import { GlassCard } from "@/components/ui/GlassCard";

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

  useEffect(() => {
    let cancelled = false;
    fetch("/api/calendar/suggestions", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ lifeAreas }),
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
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

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
                  onClick={() => acceptSuggestion(s.id)}
                  className="flex items-center gap-1 rounded-lg bg-accent-health/15 px-2 py-1 text-xs text-accent-health"
                >
                  <Check size={12} />
                  אשר
                </button>
                <button
                  onClick={() => dismissSuggestion(s.id)}
                  className="flex items-center gap-1 rounded-lg bg-white/5 px-2 py-1 text-xs text-muted"
                >
                  <X size={12} />
                  התעלם
                </button>
              </div>
            </div>
          </motion.li>
        ))}
      </ul>
    </GlassCard>
  );
}
